/**
 * Transcription en direct pendant un enregistrement.
 *
 * Principes :
 *  - Indépendante de l'enregistrement audio : aucune de ses erreurs ne
 *    remonte à l'enregistreur. Au pire, la transcription s'arrête et l'audio
 *    continue (il pourra être transcrit plus tard depuis le fichier).
 *  - Le moteur natif est partagé et ses événements ne sont pas étiquetés :
 *      · une seule utilisation à la fois (engineLock) ;
 *      · une tâche n'est considérée « en cours » qu'après l'événement natif
 *        `start` ; un arrêt demandé pendant le démarrage est DIFFÉRÉ jusqu'à
 *        ce `start` (sinon la tâche native démarrerait après l'arrêt et
 *        garderait le micro — relecture du 2026-11-11, bug 1) ;
 *      · les événements reçus hors tâche sont ignorés.
 *  - iOS termine régulièrement les tâches (silence, limites) : tant que
 *    l'utilisateur enregistre, une nouvelle tâche est relancée. Seuls les
 *    ÉCHECS RAPIDES (tâche jamais démarrée ou terminée en < 1,5 s) comptent
 *    pour l'anti-boucle : un long silence de lecture ne coupe pas la
 *    transcription.
 *  - Erreurs bloquantes (permission refusée, langue non prise en charge,
 *    service indisponible) : « indisponible », sans insister.
 *  - Chaque gestionnaire d'événement natif est isolé (try/catch) : une
 *    exception dans la transcription ne peut pas devenir une erreur JS
 *    fatale, qui fermerait l'app pendant l'enregistrement.
 *  - `hadGap` signale qu'une partie de la parole n'a peut-être pas été
 *    transcrite (interruption, coupure, abandon) : le texte est alors
 *    enregistré comme PARTIEL, à compléter depuis l'audio.
 */
import type { ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';

import { TranscriptAccumulator } from './accumulator';
import type { SpeechEngine } from './engine';
import { acquireEngine, type EngineHolder } from './engineLock';

export type TranscriberStatus = 'idle' | 'listening' | 'restarting' | 'paused' | 'stopped' | 'unavailable';

export type UnavailableReason = 'permission' | 'language' | 'service' | 'loop' | 'no-offline' | 'unknown';

export interface LiveTranscriberCallbacks {
  onCommit: (segment: string) => void;
  onChange: (fullText: string) => void;
  onStatus: (status: TranscriberStatus, reason?: UnavailableReason) => void;
}

const FATAL: Record<string, UnavailableReason> = {
  'not-allowed': 'permission',
  'service-not-allowed': 'service',
  'language-not-supported': 'language',
};

export const RESTART_DELAY_MS = 400;
/** Au-delà de MAX_RAPID_FAILURES échecs rapides consécutifs en RESTART_WINDOW_MS : on abandonne. */
export const MAX_RAPID_FAILURES = 6;
export const RESTART_WINDOW_MS = 60_000;
/** Une tâche plus courte est un « échec rapide ». */
export const RAPID_FAILURE_MS = 1500;
export const STOP_TIMEOUT_MS = 2500;

type Phase = 'idle' | 'starting' | 'running';

export class LiveTranscriber {
  private readonly acc: TranscriptAccumulator;
  private wantRunning = false;
  private phase: Phase = 'idle';
  /** Arrêt demandé pendant le démarrage : envoyé au moteur dès l'événement `start`. */
  private stopWhenStarted = false;
  private taskStartedAt = 0;
  private status: TranscriberStatus = 'idle';
  private unavailableReason: UnavailableReason | undefined;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private rapidFailures: number[] = [];
  private unsubscribers: (() => void)[] = [];
  private endWaiters: (() => void)[] = [];
  private release: (() => void) | null = null;
  private disposed = false;
  private gap = false;
  private readonly holder: EngineHolder;

  constructor(
    private readonly engine: SpeechEngine,
    private readonly options: ExpoSpeechRecognitionOptions,
    private readonly cb: LiveTranscriberCallbacks,
    private readonly now: () => number = () => Date.now(),
    initialSegments: string[] = [],
  ) {
    this.acc = new TranscriptAccumulator(initialSegments, now);
    // Si une autre utilisation (fichier) prend le moteur, on s'arrête proprement.
    this.holder = { cancel: () => this.stop().then(() => undefined) };
    this.unsubscribers.push(
      engine.on('start', () => this.guard(() => {
        if (this.phase !== 'starting') return;
        this.phase = 'running';
        this.taskStartedAt = this.now();
        if (this.stopWhenStarted || this.disposed) {
          this.stopWhenStarted = false;
          this.safe(() => (this.disposed ? this.engine.abort() : this.engine.stop()));
        }
      })),
      engine.on('result', ({ text, isFinal }) => this.guard(() => {
        if (this.phase === 'idle') return;
        for (const s of this.acc.onResult(text, isFinal)) this.cb.onCommit(s);
        this.cb.onChange(this.acc.fullText);
      })),
      engine.on('error', ({ code }) => this.guard(() => {
        if (this.phase === 'idle') return;
        const fatal = FATAL[code];
        if (fatal) {
          this.wantRunning = false;
          this.gap = true;
          this.setStatus('unavailable', fatal);
        } else if (code === 'interrupted') {
          // Appel, Siri, alarme, changement de route en arrière-plan : on attend
          // que l'enregistreur tourne de nouveau (resume() appelé par le hook).
          // Compté comme échec rapide : des interruptions en rafale (ex. écran
          // verrouillé) ne relancent pas le moteur indéfiniment.
          this.gap = true;
          if (this.tooManyRapidFailures()) {
            this.wantRunning = false;
            this.setStatus('unavailable', 'loop');
            return;
          }
          this.wantRunning = false;
          this.setStatus('paused');
        } else if (code === 'audio-capture') {
          // Micro occupé ou route audio perdue : « end » suit, relance normale
          // (avec anti-boucle).
          this.gap = true;
        }
        // Autres codes (no-speech, speech-timeout, aborted, network…) : non bloquants ; « end » suit.
      })),
      engine.on('end', () => this.guard(() => this.handleEnd())),
    );
  }

  get text(): string {
    return this.acc.fullText;
  }

  get currentStatus(): TranscriberStatus {
    return this.status;
  }

  /** Une partie de la parole a pu ne pas être transcrite (interruption, abandon). */
  get hadGap(): boolean {
    return this.gap;
  }

  get reason(): UnavailableReason | undefined {
    return this.unavailableReason;
  }

  /** Démarre (prend le verrou du moteur, en arrêtant toute autre utilisation). */
  async start(): Promise<void> {
    if (this.disposed || this.isBlocked()) return;
    this.wantRunning = true;
    this.release = await acquireEngine(this.holder);
    if (this.disposed || !this.wantRunning) return;
    this.launch();
  }

  /** Pause (pause utilisateur ou interruption) : termine proprement la tâche courante. */
  pause(): void {
    if (this.status === 'unavailable') return;
    this.wantRunning = false;
    this.clearRestart();
    this.requestEngineStop();
    this.setStatus('paused');
  }

  /** Reprise. Après un abandon pour boucle, une reprise manuelle réessaie. */
  resume(): void {
    if (this.disposed || this.isBlocked()) return;
    if (this.status === 'unavailable' && this.unavailableReason === 'loop') this.rapidFailures = [];
    this.wantRunning = true;
    if (this.phase === 'idle') this.launch();
  }

  /**
   * Arrêt final : attend la fin de la tâche (dernier résultat) au plus
   * STOP_TIMEOUT_MS, valide le texte restant et retourne le texte complet.
   */
  async stop(): Promise<string> {
    this.wantRunning = false;
    this.clearRestart();
    if (this.phase !== 'idle') {
      const ended = new Promise<void>((resolve) => this.endWaiters.push(resolve));
      this.requestEngineStop();
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([ended, new Promise<void>((r) => (timer = setTimeout(r, STOP_TIMEOUT_MS)))]);
      clearTimeout(timer);
      // (re-lecture : `phase` a pu changer pendant l'attente)
      if ((this.phase as Phase) !== 'idle') {
        // Le moteur n'a pas répondu à temps : on coupe net, le texte déjà reçu est conservé.
        this.phase = 'idle';
        this.safe(() => this.engine.abort());
      }
    }
    for (const s of this.acc.onTaskEnd()) this.cb.onCommit(s);
    if (this.status !== 'unavailable') this.setStatus('stopped');
    this.releaseEngine();
    return this.acc.fullText;
  }

  /**
   * Libération (démontage de l'écran). Si une tâche est en cours de
   * démarrage, elle sera interrompue dès son `start` (écouteurs gardés
   * jusque-là), pour ne jamais laisser une tâche native orpheline.
   */
  dispose(): void {
    this.disposed = true;
    this.wantRunning = false;
    this.clearRestart();
    if (this.phase === 'running') {
      this.safe(() => this.engine.abort());
      this.phase = 'idle';
    }
    if (this.phase === 'idle') this.detach();
    // phase 'starting' : le gestionnaire `start` appellera abort(), puis `end` détachera.
    this.releaseEngine();
  }

  private isBlocked(): boolean {
    return this.status === 'unavailable' && this.unavailableReason !== 'loop';
  }

  private requestEngineStop() {
    if (this.phase === 'running') this.safe(() => this.engine.stop());
    else if (this.phase === 'starting') this.stopWhenStarted = true;
  }

  private launch() {
    this.clearRestart();
    this.stopWhenStarted = false;
    try {
      this.phase = 'starting';
      this.taskStartedAt = this.now();
      this.engine.start(this.options);
      this.setStatus('listening');
    } catch {
      this.phase = 'idle';
      this.wantRunning = false;
      this.gap = true;
      this.setStatus('unavailable', 'unknown');
    }
  }

  private handleEnd() {
    if (this.phase === 'idle') return; // fin d'une tâche qui n'est pas la nôtre
    const neverStarted = this.phase === 'starting';
    const lasted = this.now() - this.taskStartedAt;
    this.phase = 'idle';
    this.stopWhenStarted = false;
    for (const s of this.acc.onTaskEnd()) this.cb.onCommit(s);
    this.cb.onChange(this.acc.fullText);
    this.endWaiters.splice(0).forEach((r) => r());
    if (this.disposed) {
      this.detach();
      return;
    }
    if (!this.wantRunning) return;

    // Relance automatique. Seuls les échecs rapides comptent pour l'anti-boucle.
    if (neverStarted || lasted < RAPID_FAILURE_MS) {
      if (this.tooManyRapidFailures()) {
        this.wantRunning = false;
        this.gap = true;
        this.setStatus('unavailable', 'loop');
        return;
      }
    } else {
      this.rapidFailures = [];
    }
    this.setStatus('restarting');
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.wantRunning && !this.disposed && this.phase === 'idle') this.launch();
    }, RESTART_DELAY_MS);
  }

  /** Enregistre un échec rapide ; vrai si la limite est dépassée. */
  private tooManyRapidFailures(): boolean {
    const t = this.now();
    this.rapidFailures = this.rapidFailures.filter((x) => t - x < RESTART_WINDOW_MS);
    this.rapidFailures.push(t);
    return this.rapidFailures.length > MAX_RAPID_FAILURES;
  }

  private detach() {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
  }

  private releaseEngine() {
    this.release?.();
    this.release = null;
  }

  private clearRestart() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  /** Gestionnaire d'événement natif : aucune exception ne doit s'en échapper. */
  private guard(fn: () => void) {
    try {
      fn();
    } catch {
      this.gap = true;
    }
  }

  private safe(fn: () => void) {
    try {
      fn();
    } catch {
      /* ignoré : la transcription ne doit jamais faire échouer l'enregistrement */
    }
  }

  private setStatus(s: TranscriberStatus, reason?: UnavailableReason) {
    this.status = s;
    this.unavailableReason = s === 'unavailable' ? reason : undefined;
    this.cb.onStatus(s, reason);
  }
}
