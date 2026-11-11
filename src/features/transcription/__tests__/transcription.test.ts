import { TranscriptAccumulator } from '../accumulator';
import type { SpeechEngine, SpeechEngineEvents } from '../engine';
import { fileOptions, liveOptions } from '../engine';
import { transcribeFile } from '../fileTranscriber';
import { LiveTranscriber, MAX_RESTARTS, RESTART_DELAY_MS, STOP_TIMEOUT_MS, type TranscriberStatus } from '../liveTranscriber';

/** Faux moteur scriptable (simule les événements d'expo-speech-recognition). */
function fakeEngine(opts: { respondToStop?: boolean } = {}) {
  const listeners: { [K in keyof SpeechEngineEvents]: SpeechEngineEvents[K][] } = { result: [], error: [], end: [] };
  const calls = { start: 0, stop: 0, abort: 0 };
  const engine: SpeechEngine = {
    start: () => void calls.start++,
    stop: () => {
      calls.stop++;
      // Promise (et non queueMicrotask, que les faux minuteurs de Jest simulent).
      if (opts.respondToStop !== false) void Promise.resolve().then(() => emit.end());
    },
    abort: () => void calls.abort++,
    on(event, cb) {
      (listeners[event] as unknown[]).push(cb);
      return () => {
        const arr = listeners[event] as unknown[];
        arr.splice(arr.indexOf(cb), 1);
      };
    },
  };
  const emit = {
    result: (text: string, isFinal = false) => listeners.result.forEach((l) => l({ text, isFinal })),
    error: (code: string) => listeners.error.forEach((l) => l({ code })),
    end: () => listeners.end.forEach((l) => l()),
  };
  return { engine, emit, calls, listeners };
}

function harness(engineOpts?: { respondToStop?: boolean }, initial: string[] = []) {
  const f = fakeEngine(engineOpts);
  const commits: string[] = [];
  const statuses: string[] = [];
  let text = '';
  let clock = 0;
  const t = new LiveTranscriber(
    f.engine,
    liveOptions(false),
    {
      onCommit: (s) => commits.push(s),
      onChange: (x) => (text = x),
      onStatus: (s: TranscriberStatus, r) => statuses.push(r ? `${s}:${r}` : s),
    },
    () => clock,
    initial,
  );
  return { ...f, t, commits, statuses, getText: () => text, advanceClock: (ms: number) => (clock += ms) };
}

describe('TranscriptAccumulator (sémantique iOS 18+)', () => {
  it('résultats intermédiaires remplacés, finals validés à chaque pause', () => {
    const a = new TranscriptAccumulator();
    a.onResult('je pense', false);
    a.onResult('Je pense que le narrateur', false);
    expect(a.fullText).toBe('Je pense que le narrateur');
    expect(a.onResult('Je pense que le narrateur ment.', true)).toEqual(['Je pense que le narrateur ment.']);
    a.onResult(' Il cache', false); // iOS 18 : repart de zéro, avec un espace devant
    expect(a.fullText).toBe('Je pense que le narrateur ment. Il cache');
    a.onResult(' Il cache quelque chose.', true);
    expect(a.segments).toEqual(['Je pense que le narrateur ment.', 'Il cache quelque chose.']);
  });

  it('dédoublonne un final de fin de tâche qui répète ou cumule le texte déjà validé', () => {
    const a = new TranscriptAccumulator();
    a.onResult('Phrase un.', true);
    a.onResult('Phrase deux.', true);
    expect(a.onResult('Phrase deux.', true)).toEqual([]); // répétition du dernier
    expect(a.onResult('Phrase un. Phrase deux.', true)).toEqual([]); // cumul exact
    expect(a.onResult('Phrase un. Phrase deux. Phrase trois.', true)).toEqual(['Phrase trois.']); // cumul + nouveau
    expect(a.fullText).toBe('Phrase un. Phrase deux. Phrase trois.');
  });

  it('valide le texte intermédiaire restant à la fin d’une tâche', () => {
    const a = new TranscriptAccumulator(['Avant.']);
    a.onResult('coupé net', false);
    expect(a.onTaskEnd()).toEqual(['coupé net']);
    expect(a.fullText).toBe('Avant. coupé net');
    expect(a.onTaskEnd()).toEqual([]);
  });

  it('ignore les résultats vides', () => {
    const a = new TranscriptAccumulator();
    expect(a.onResult('   ', true)).toEqual([]);
    expect(a.fullText).toBe('');
  });
});

describe('LiveTranscriber', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('affiche le texte en direct et sauvegarde chaque énoncé validé', () => {
    const h = harness();
    h.t.start();
    h.emit.result('Bonjour', false);
    expect(h.getText()).toBe('Bonjour');
    h.emit.result('Bonjour à tous.', true);
    expect(h.commits).toEqual(['Bonjour à tous.']);
    expect(h.statuses).toEqual(['listening']);
  });

  it('relance automatiquement une tâche terminée par iOS tant que l’enregistrement continue', () => {
    const h = harness();
    h.t.start();
    h.emit.result('Premier énoncé', false);
    h.emit.end(); // iOS termine la tâche (silence…)
    expect(h.commits).toEqual(['Premier énoncé']);
    expect(h.calls.start).toBe(1);
    jest.advanceTimersByTime(RESTART_DELAY_MS);
    expect(h.calls.start).toBe(2);
    h.emit.result('Deuxième', true);
    expect(h.t.text).toBe('Premier énoncé Deuxième');
  });

  it('abandonne proprement en cas de boucle de redémarrages sans texte', () => {
    const h = harness();
    h.t.start();
    for (let i = 0; i <= MAX_RESTARTS; i++) {
      h.emit.end();
      jest.advanceTimersByTime(RESTART_DELAY_MS);
    }
    expect(h.statuses[h.statuses.length - 1]).toBe('unavailable:loop');
    const starts = h.calls.start;
    h.emit.end();
    jest.advanceTimersByTime(RESTART_DELAY_MS * 5);
    expect(h.calls.start).toBe(starts); // plus de relance
  });

  it('du texte reconnu réinitialise la protection anti-boucle', () => {
    const h = harness();
    h.t.start();
    for (let i = 0; i < MAX_RESTARTS * 3; i++) {
      h.emit.result(`énoncé ${i}`, true);
      h.emit.end();
      jest.advanceTimersByTime(RESTART_DELAY_MS);
    }
    expect(h.statuses).not.toContain('unavailable:loop');
  });

  it('permission refusée / langue non prise en charge : indisponible, sans relance', () => {
    for (const [code, reason] of [
      ['not-allowed', 'permission'],
      ['language-not-supported', 'language'],
    ]) {
      const h = harness();
      h.t.start();
      h.emit.error(code!);
      h.emit.end();
      jest.advanceTimersByTime(RESTART_DELAY_MS * 3);
      expect(h.calls.start).toBe(1);
      expect(h.statuses).toContain(`unavailable:${reason}`);
    }
  });

  it('interruption système : pause sans relance, puis reprise sur demande', () => {
    const h = harness();
    h.t.start();
    h.emit.result('Avant l’appel', false);
    h.emit.error('interrupted');
    h.emit.end();
    jest.advanceTimersByTime(RESTART_DELAY_MS * 3);
    expect(h.calls.start).toBe(1);
    expect(h.commits).toEqual(['Avant l’appel']);
    h.t.resume();
    expect(h.calls.start).toBe(2);
  });

  it('pause/reprise utilisateur : la tâche est terminée puis relancée, texte conservé', async () => {
    const h = harness();
    h.t.start();
    h.emit.result('Partie un', false);
    h.t.pause();
    await Promise.resolve(); // « end » émis par le faux moteur
    expect(h.commits).toEqual(['Partie un']);
    jest.advanceTimersByTime(RESTART_DELAY_MS * 3);
    expect(h.calls.start).toBe(1); // pas de relance pendant la pause
    h.t.resume();
    h.emit.result('Partie deux', true);
    expect(h.t.text).toBe('Partie un Partie deux');
  });

  it('arrêt : attend le dernier résultat et retourne le texte complet', async () => {
    const h = harness();
    h.t.start();
    h.emit.result('Dernière phrase', false);
    const text = await h.t.stop();
    expect(text).toBe('Dernière phrase');
    expect(h.commits).toEqual(['Dernière phrase']);
    expect(h.statuses[h.statuses.length - 1]).toBe('stopped');
  });

  it('arrêt : si le moteur ne répond pas, coupe après le délai sans perdre le texte reçu', async () => {
    const h = harness({ respondToStop: false });
    h.t.start();
    h.emit.result('Texte reçu', false);
    const p = h.t.stop();
    jest.advanceTimersByTime(STOP_TIMEOUT_MS);
    expect(await p).toBe('Texte reçu');
    expect(h.calls.abort).toBe(1);
  });

  it('reprend le texte déjà sauvegardé (segments initiaux)', () => {
    const h = harness(undefined, ['Déjà là.']);
    h.t.start();
    h.emit.result('Suite', true);
    expect(h.t.text).toBe('Déjà là. Suite');
  });

  it('dispose : plus aucune réaction aux événements', () => {
    const h = harness();
    h.t.start();
    h.t.dispose();
    h.emit.result('fantôme', true);
    expect(h.commits).toEqual([]);
    expect(Object.values(h.listeners).every((l) => l.length === 0)).toBe(true);
  });
});

describe('options du moteur', () => {
  it('en direct : français, continu, sur l’appareil par défaut, session audio identique à l’enregistreur', () => {
    const o = liveOptions(false);
    expect(o).toMatchObject({ lang: 'fr-FR', continuous: true, interimResults: true, requiresOnDeviceRecognition: true });
    expect(o.iosCategory).toEqual({ category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth'], mode: 'default' });
    expect(liveOptions(true).requiresOnDeviceRecognition).toBe(false);
  });
  it('fichier : lit le fichier, sur l’appareil par défaut', () => {
    expect(fileOptions('file:///x.m4a', false)).toMatchObject({ audioSource: { uri: 'file:///x.m4a' }, requiresOnDeviceRecognition: true });
  });
});

describe('transcribeFile', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('assemble le texte du fichier', async () => {
    const f = fakeEngine();
    const p = transcribeFile(f.engine, fileOptions('file:///a.m4a', false), 60_000);
    f.emit.result('Un.', true);
    f.emit.result('Deux.', true);
    f.emit.end();
    await expect(p).resolves.toBe('Un. Deux.');
  });

  it('échec explicite si erreur bloquante sans texte', async () => {
    const f = fakeEngine();
    const p = transcribeFile(f.engine, fileOptions('file:///a.m4a', false), 60_000);
    f.emit.error('language-not-supported');
    f.emit.end();
    await expect(p).rejects.toMatchObject({ code: 'language-not-supported' });
  });

  it('délai dépassé : conserve le texte partiel, sinon échoue', async () => {
    const f = fakeEngine();
    const p = transcribeFile(f.engine, fileOptions('file:///a.m4a', false), 1000);
    f.emit.result('Partiel', false);
    jest.advanceTimersByTime(1000);
    await expect(p).resolves.toBe('Partiel');
    const g = fakeEngine();
    const q = transcribeFile(g.engine, fileOptions('file:///b.m4a', false), 1000);
    jest.advanceTimersByTime(1000);
    await expect(q).rejects.toMatchObject({ code: 'timeout' });
  });
});
