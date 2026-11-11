import { REPEAT_WINDOW_MS, TranscriptAccumulator } from '../accumulator';
import type { SpeechEngine, SpeechEngineEvents } from '../engine';
import { fileOptions, liveOptions, onDeviceFrenchVerifiable } from '../engine';
import { __resetEngineLock } from '../engineLock';
import { transcribeFile } from '../fileTranscriber';
import {
  LiveTranscriber,
  MAX_RAPID_FAILURES,
  RAPID_FAILURE_MS,
  RESTART_DELAY_MS,
  STOP_TIMEOUT_MS,
  type TranscriberStatus,
} from '../liveTranscriber';

type Listeners = { [K in keyof SpeechEngineEvents]: SpeechEngineEvents[K][] };

/**
 * Faux moteur scriptable (sémantique d'expo-speech-recognition lue dans son
 * Swift) : `start()` est asynchrone côté natif — l'événement `start` arrive
 * plus tard (ici : à la demande, ou automatiquement si autoStart).
 */
function fakeEngine(opts: { respondToStop?: boolean; autoStart?: boolean } = {}) {
  const listeners: Listeners = { start: [], result: [], error: [], end: [] };
  const calls = { start: 0, stop: 0, abort: 0 };
  const emit = {
    start: () => listeners.start.forEach((l) => l()),
    result: (text: string, isFinal = false) => listeners.result.forEach((l) => l({ text, isFinal })),
    error: (code: string) => listeners.error.forEach((l) => l({ code })),
    end: () => listeners.end.forEach((l) => l()),
  };
  const engine: SpeechEngine = {
    start: () => {
      calls.start++;
      if (opts.autoStart !== false) emit.start();
    },
    stop: () => {
      calls.stop++;
      // Promise (et non queueMicrotask, que les faux minuteurs de Jest simulent).
      if (opts.respondToStop !== false) void Promise.resolve().then(() => emit.end());
    },
    abort: () => {
      calls.abort++;
      void Promise.resolve().then(() => emit.end());
    },
    on(event, cb) {
      (listeners[event] as unknown[]).push(cb);
      return () => {
        const arr = listeners[event] as unknown[];
        arr.splice(arr.indexOf(cb), 1);
      };
    },
  };
  return { engine, emit, calls, listeners };
}

function harness(engineOpts?: { respondToStop?: boolean; autoStart?: boolean }, initial: string[] = []) {
  const f = fakeEngine(engineOpts);
  const commits: string[] = [];
  const statuses: string[] = [];
  let clock = 0;
  const t = new LiveTranscriber(
    f.engine,
    liveOptions(false),
    {
      onCommit: (s) => commits.push(s),
      onChange: () => undefined,
      onStatus: (s: TranscriberStatus, r) => statuses.push(r ? `${s}:${r}` : s),
    },
    () => clock,
    initial,
  );
  return { ...f, t, commits, statuses, tick: (ms: number) => (clock += ms) };
}

const flush = () => Promise.resolve().then(() => undefined);

beforeEach(() => __resetEngineLock());

describe('TranscriptAccumulator (sémantique iOS 18+)', () => {
  it('résultats intermédiaires remplacés, finals validés à chaque pause', () => {
    const a = new TranscriptAccumulator();
    a.onResult('je pense', false);
    a.onResult('Je pense que le narrateur', false);
    expect(a.fullText).toBe('Je pense que le narrateur');
    expect(a.onResult('Je pense que le narrateur ment.', true)).toEqual(['Je pense que le narrateur ment.']);
    a.onResult(' Il cache', false);
    expect(a.fullText).toBe('Je pense que le narrateur ment. Il cache');
    a.onResult(' Il cache quelque chose.', true);
    expect(a.segments).toEqual(['Je pense que le narrateur ment.', 'Il cache quelque chose.']);
  });

  it('dédoublonne un écho de fin de tâche (répétition ou cumul immédiats)', () => {
    let now = 0;
    const a = new TranscriptAccumulator([], () => now);
    a.onResult('Phrase un.', true);
    now += 300;
    a.onResult('Phrase deux.', true);
    now += 300;
    expect(a.onResult('Phrase deux.', true)).toEqual([]);
    expect(a.onResult('Phrase un. Phrase deux.', true)).toEqual([]);
    expect(a.onResult('Phrase un. Phrase deux. Phrase trois.', true)).toEqual(['Phrase trois.']);
  });

  it('conserve une vraie répétition volontaire (au-delà de la fenêtre)', () => {
    let now = 0;
    const a = new TranscriptAccumulator([], () => now);
    a.onResult('Oui.', true);
    now += REPEAT_WINDOW_MS + 1;
    expect(a.onResult('Oui.', true)).toEqual(['Oui.']);
    expect(a.fullText).toBe('Oui. Oui.');
  });

  it('valide le texte intermédiaire restant à la fin d’une tâche', () => {
    const a = new TranscriptAccumulator(['Avant.']);
    a.onResult('coupé net', false);
    expect(a.onTaskEnd()).toEqual(['coupé net']);
    expect(a.fullText).toBe('Avant. coupé net');
  });
});

describe('LiveTranscriber', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('texte en direct et sauvegarde de chaque énoncé validé', async () => {
    const h = harness();
    await h.t.start();
    h.emit.result('Bonjour', false);
    h.emit.result('Bonjour à tous.', true);
    expect(h.commits).toEqual(['Bonjour à tous.']);
    expect(h.t.text).toBe('Bonjour à tous.');
  });

  it('relance une tâche terminée par iOS tant que l’enregistrement continue', async () => {
    const h = harness();
    await h.t.start();
    h.emit.result('Premier énoncé', false);
    h.tick(5000);
    h.emit.end();
    expect(h.commits).toEqual(['Premier énoncé']);
    jest.advanceTimersByTime(RESTART_DELAY_MS);
    expect(h.calls.start).toBe(2);
    h.emit.result('Deuxième', true);
    expect(h.t.text).toBe('Premier énoncé Deuxième');
  });

  it('un long silence (tâches longues sans texte) ne déclenche PAS l’anti-boucle', async () => {
    const h = harness();
    await h.t.start();
    for (let i = 0; i < MAX_RAPID_FAILURES * 3; i++) {
      h.tick(RAPID_FAILURE_MS + 5000); // tâche « no-speech » de plusieurs secondes
      h.emit.error('no-speech');
      h.emit.end();
      jest.advanceTimersByTime(RESTART_DELAY_MS);
    }
    expect(h.statuses).not.toContain('unavailable:loop');
  });

  it('des échecs rapides répétés déclenchent l’anti-boucle ; une reprise manuelle réessaie', async () => {
    const h = harness();
    await h.t.start();
    for (let i = 0; i <= MAX_RAPID_FAILURES; i++) {
      h.emit.end(); // fin immédiate
      jest.advanceTimersByTime(RESTART_DELAY_MS);
    }
    expect(h.statuses[h.statuses.length - 1]).toBe('unavailable:loop');
    const starts = h.calls.start;
    h.t.resume();
    expect(h.calls.start).toBe(starts + 1);
  });

  it('permission refusée / langue non prise en charge : indisponible, sans relance', async () => {
    for (const [code, reason] of [
      ['not-allowed', 'permission'],
      ['language-not-supported', 'language'],
    ]) {
      __resetEngineLock();
      const h = harness();
      await h.t.start();
      h.emit.error(code!);
      h.emit.end();
      jest.advanceTimersByTime(RESTART_DELAY_MS * 3);
      expect(h.calls.start).toBe(1);
      expect(h.statuses).toContain(`unavailable:${reason}`);
      h.t.resume();
      expect(h.calls.start).toBe(1); // blocage définitif
    }
  });

  it('interruption : pause sans relance, puis reprise', async () => {
    const h = harness();
    await h.t.start();
    h.emit.result('Avant l’appel', false);
    h.emit.error('interrupted');
    h.emit.end();
    jest.advanceTimersByTime(RESTART_DELAY_MS * 3);
    expect(h.calls.start).toBe(1);
    expect(h.t.currentStatus).toBe('paused');
    h.t.resume();
    expect(h.calls.start).toBe(2);
  });

  it('BUG 1 — arrêt demandé PENDANT le démarrage : différé jusqu’au `start` natif, aucune tâche orpheline', async () => {
    const h = harness({ autoStart: false });
    await h.t.start();
    expect(h.calls.start).toBe(1);
    const p = h.t.stop();
    expect(h.calls.stop).toBe(0); // pas d'arrêt envoyé avant que la tâche existe
    h.emit.start(); // la tâche native démarre réellement
    expect(h.calls.stop).toBe(1); // … et elle est arrêtée aussitôt
    await flush();
    await p;
    expect(h.t.currentStatus).toBe('stopped');
  });

  it('BUG 1 — des fins périmées/étrangères reçues pendant l’attente de relance sont ignorées', async () => {
    const h = harness();
    await h.t.start();
    h.emit.end(); // fin de NOTRE tâche (rapide) → relance programmée
    for (let i = 0; i <= MAX_RAPID_FAILURES + 2; i++) h.emit.end(); // rafale de fins qui ne sont pas à nous
    jest.advanceTimersByTime(RESTART_DELAY_MS);
    expect(h.statuses).not.toContain('unavailable:loop');
    expect(h.calls.start).toBe(2); // une seule relance
  });

  it('pause/reprise utilisateur : texte conservé, pas de relance pendant la pause', async () => {
    const h = harness();
    await h.t.start();
    h.emit.result('Partie un', false);
    h.t.pause();
    await flush();
    expect(h.commits).toEqual(['Partie un']);
    jest.advanceTimersByTime(RESTART_DELAY_MS * 3);
    expect(h.calls.start).toBe(1);
    h.t.resume();
    h.emit.result('Partie deux', true);
    expect(h.t.text).toBe('Partie un Partie deux');
  });

  it('arrêt : dernier résultat inclus ; moteur muet → coupure après le délai', async () => {
    const h = harness();
    await h.t.start();
    h.emit.result('Dernière phrase', false);
    expect(await h.t.stop()).toBe('Dernière phrase');
    __resetEngineLock();
    const m = harness({ respondToStop: false });
    await m.t.start();
    m.emit.result('Texte reçu', false);
    const p = m.t.stop();
    jest.advanceTimersByTime(STOP_TIMEOUT_MS);
    expect(await p).toBe('Texte reçu');
    expect(m.calls.abort).toBe(1);
  });

  it('dispose pendant le démarrage : la tâche est interrompue dès son `start`', async () => {
    const h = harness({ autoStart: false });
    await h.t.start();
    h.t.dispose();
    expect(h.calls.abort).toBe(0);
    h.emit.start();
    expect(h.calls.abort).toBe(1);
    await flush();
    expect(Object.values(h.listeners).every((l) => l.length === 0)).toBe(true);
  });

  it('reprend le texte déjà sauvegardé (segments initiaux)', async () => {
    const h = harness(undefined, ['Déjà là.']);
    await h.t.start();
    h.emit.result('Suite', true);
    expect(h.t.text).toBe('Déjà là. Suite');
  });
});

describe('options et confidentialité', () => {
  it('direct : français, continu, sur l’appareil par défaut, session audio identique à l’enregistreur', () => {
    const o = liveOptions(false);
    expect(o).toMatchObject({ lang: 'fr-FR', continuous: true, interimResults: true, requiresOnDeviceRecognition: true });
    expect(o.iosCategory).toEqual({ category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth'], mode: 'default' });
    expect(fileOptions('file:///x.m4a', false)).toMatchObject({ audioSource: { uri: 'file:///x.m4a' }, requiresOnDeviceRecognition: true });
  });
  it('BUG 4 — hors-ligne vérifiable seulement si l’iPhone est en français', () => {
    expect(onDeviceFrenchVerifiable('fr-FR')).toBe(true);
    expect(onDeviceFrenchVerifiable('fr_CA')).toBe(true);
    expect(onDeviceFrenchVerifiable('fr')).toBe(true);
    expect(onDeviceFrenchVerifiable('en-US')).toBe(false);
    expect(onDeviceFrenchVerifiable('fy-NL')).toBe(false);
    expect(onDeviceFrenchVerifiable('')).toBe(false);
  });
});

describe('transcribeFile', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('texte complet du fichier', async () => {
    const f = fakeEngine();
    const p = transcribeFile(f.engine, fileOptions('file:///a.m4a', false), 60_000);
    await flush();
    f.emit.result('Un.', true);
    f.emit.result('Deux.', true);
    f.emit.end();
    await expect(p).resolves.toEqual({ text: 'Un. Deux.', complete: true });
  });

  it('BUG 5 — délai dépassé ou erreur après un début de texte : signalé PARTIEL', async () => {
    const f = fakeEngine();
    const p = transcribeFile(f.engine, fileOptions('file:///a.m4a', false), 1000);
    await flush();
    f.emit.result('Partiel', false);
    jest.advanceTimersByTime(1000);
    await expect(p).resolves.toEqual({ text: 'Partiel', complete: false });

    __resetEngineLock();
    const g = fakeEngine();
    const q = transcribeFile(g.engine, fileOptions('file:///b.m4a', false), 60_000);
    await flush();
    g.emit.result('Début.', true);
    g.emit.error('network');
    g.emit.end();
    await expect(q).resolves.toEqual({ text: 'Début.', complete: false });
  });

  it('échec explicite si erreur bloquante sans texte', async () => {
    const f = fakeEngine();
    const p = transcribeFile(f.engine, fileOptions('file:///a.m4a', false), 60_000);
    await flush();
    f.emit.error('language-not-supported');
    f.emit.end();
    await expect(p).rejects.toMatchObject({ code: 'language-not-supported' });
  });

  it('BUG 6 — annulation (écran quitté) : rejet « cancelled », moteur arrêté', async () => {
    const f = fakeEngine();
    let cancel: () => void = () => undefined;
    const p = transcribeFile(f.engine, fileOptions('file:///a.m4a', false), 60_000, (h) => (cancel = h.cancel));
    await flush();
    f.emit.result('En cours', false);
    cancel();
    await expect(p).rejects.toMatchObject({ code: 'cancelled' });
    expect(f.calls.abort).toBe(1);
  });

  it('BUG 1 — un enregistrement en direct prend le moteur : la transcription de fichier est annulée', async () => {
    const f = fakeEngine();
    const p = transcribeFile(f.engine, fileOptions('file:///a.m4a', false), 60_000);
    await flush();
    const commits: string[] = [];
    const live = new LiveTranscriber(f.engine, liveOptions(false), { onCommit: (s) => commits.push(s), onChange: () => undefined, onStatus: () => undefined });
    const started = live.start();
    await expect(p).rejects.toMatchObject({ code: 'cancelled' });
    await started;
    f.emit.result('Texte du direct', true);
    expect(commits).toEqual(['Texte du direct']); // pas de texte du fichier mélangé
  });
});
