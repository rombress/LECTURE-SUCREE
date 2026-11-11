/**
 * Transcription en direct pendant un enregistrement.
 *
 * Principes :
 *  - Indépendante de l'enregistrement audio : aucune de ses erreurs ne
 *    remonte à l'enregistreur. Au pire, la transcription s'arrête et l'audio
 *    continue (il pourra être transcrit plus tard depuis le fichier).
 *  - iOS termine régulièrement les tâches de reconnaissance (silence,
 *    limites système) : tant que l'utilisateur enregistre, une nouvelle
 *    tâche est relancée automatiquement, avec une protection anti-boucle.
 *  - Erreurs bloquantes (permission refusée, langue non prise en charge,
 *    service indisponible) : la transcription passe « indisponible » et
 *    n'insiste pas.
 *  - Chaque énoncé validé est remis à `onCommit` pour être sauvegardé
 *    immédiatement (ajout seul).
 */
import { TranscriptAccumulator } from './accumulator';
import type { SpeechEngine } from './engine';

import type { ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';

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
/** Au-delà de MAX_RESTARTS redémarrages sans aucun texte reconnu en RESTART_WINDOW_MS : on abandonne. */
export const MAX_RESTARTS = 6;
export const RESTART_WINDOW_MS = 60_000;
export const STOP_TIMEOUT_MS = 2500;

export class LiveTranscriber {
  private readonly acc: TranscriptAccumulator;
  private wantRunning = false;
  private engineActive = false;
  private status: TranscriberStatus = 'idle';
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restarts: number[] = [];
  private unsubscribers: (() => void)[] = [];
  private stopWaiters: (() => void)[] = [];
  private disposed = false;

  constructor(
    private readonly engine: SpeechEngine,
    private readonly options: ExpoSpeechRecognitionOptions,
    private readonly cb: LiveTranscriberCallbacks,
    private readonly now: () => number = () => Date.now(),
    initialSegments: string[] = [],
  ) {
    this.acc = new TranscriptAccumulator(initialSegments);
    this.unsubscribers.push(
      engine.on('result', ({ text, isFinal }) => {
        if (!this.engineActive) return;
        if (text.trim()) this.restarts = []; // du texte arrive : la session est saine
        for (const s of this.acc.onResult(text, isFinal)) this.cb.onCommit(s);
        this.cb.onChange(this.acc.fullText);
      }),
      engine.on('error', ({ code }) => {
        const fatal = FATAL[code];
        if (fatal) {
          this.wantRunning = false;
          this.setStatus('unavailable', fatal);
        } else if (code === 'interrupted') {
          // Appel, Siri, alarme : l'enregistreur se met aussi en pause. On attend resume().
          this.wantRunning = false;
          this.setStatus('paused');
        }
        // Autres codes (no-speech, speech-timeout, aborted, network…) : non bloquants ; « end » suit.
      }),
      engine.on('end', () => this.handleEnd()),
    );
  }

  get text(): string {
    return this.acc.fullText;
  }

  get currentStatus(): TranscriberStatus {
    return this.status;
  }

  start(): void {
    if (this.disposed || this.status === 'unavailable') return;
    this.wantRunning = true;
    this.launch();
  }

  /** Pause (pause utilisateur ou interruption) : termine proprement la tâche courante. */
  pause(): void {
    if (this.status === 'unavailable') return;
    this.wantRunning = false;
    this.clearRestart();
    if (this.engineActive) this.engine.stop();
    this.setStatus('paused');
  }

  resume(): void {
    if (this.disposed || this.status === 'unavailable') return;
    this.wantRunning = true;
    if (!this.engineActive) this.launch();
  }

  /**
   * Arrêt final : attend la fin de la tâche (dernier résultat) au plus
   * STOP_TIMEOUT_MS, valide le texte restant et retourne le texte complet.
   */
  async stop(): Promise<string> {
    this.wantRunning = false;
    this.clearRestart();
    if (this.engineActive) {
      const ended = new Promise<void>((resolve) => this.stopWaiters.push(resolve));
      this.engine.stop();
      await Promise.race([ended, new Promise<void>((r) => setTimeout(r, STOP_TIMEOUT_MS))]);
      if (this.engineActive) {
        // Le moteur n'a pas répondu à temps : on coupe net, le texte déjà reçu est conservé.
        this.engineActive = false;
        try {
          this.engine.abort();
        } catch {
          /* ignoré */
        }
      }
    }
    for (const s of this.acc.onTaskEnd()) this.cb.onCommit(s);
    if (this.status !== 'unavailable') this.setStatus('stopped');
    return this.acc.fullText;
  }

  dispose(): void {
    this.disposed = true;
    this.wantRunning = false;
    this.clearRestart();
    if (this.engineActive) {
      try {
        this.engine.abort();
      } catch {
        /* ignoré */
      }
      this.engineActive = false;
    }
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
  }

  private launch() {
    this.clearRestart();
    try {
      this.engineActive = true;
      this.engine.start(this.options);
      this.setStatus('listening');
    } catch {
      this.engineActive = false;
      this.wantRunning = false;
      this.setStatus('unavailable', 'unknown');
    }
  }

  private handleEnd() {
    const wasActive = this.engineActive;
    this.engineActive = false;
    for (const s of this.acc.onTaskEnd()) this.cb.onCommit(s);
    this.cb.onChange(this.acc.fullText);
    this.stopWaiters.splice(0).forEach((r) => r());
    if (!wasActive || !this.wantRunning || this.disposed) return;

    // Relance automatique, avec protection anti-boucle.
    const t = this.now();
    this.restarts = this.restarts.filter((x) => t - x < RESTART_WINDOW_MS);
    this.restarts.push(t);
    if (this.restarts.length > MAX_RESTARTS) {
      this.wantRunning = false;
      this.setStatus('unavailable', 'loop');
      return;
    }
    this.setStatus('restarting');
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.wantRunning && !this.disposed) this.launch();
    }, RESTART_DELAY_MS);
  }

  private clearRestart() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private setStatus(s: TranscriberStatus, reason?: UnavailableReason) {
    this.status = s;
    this.cb.onStatus(s, reason);
  }
}
