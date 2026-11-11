import { formatLog, REDACTED, sanitizeMeta } from '../log';

describe('log — aucun contenu personnel', () => {
  it('conserve nombres, booléens, null et codes courts', () => {
    expect(sanitizeMeta({ n: 3, ok: true, x: null, engine: 'ios-speech-ondevice' })).toEqual({
      n: 3,
      ok: true,
      x: null,
      engine: 'ios-speech-ondevice',
    });
  });

  it('masque tout texte libre (titre, transcription, chemin, e-mail)', () => {
    const m = sanitizeMeta({
      title: 'Le Seigneur des Anneaux',
      transcript: 'je pense que le personnage ment',
      path: '/var/mobile/Containers/Data/abc/audio.wav',
      mail: 'quelqu.un@example.com',
    });
    expect(Object.values(m).every((v) => v === REDACTED)).toBe(true);
  });

  it('remplace un nom d’événement invalide et ignore les clés suspectes', () => {
    const line = formatLog('info', 'Titre du livre: Dune', { 'clé avec espace': 1 });
    expect(line).toContain('invalid_event');
    expect(line).not.toContain('Dune');
    expect(line).not.toContain('clé avec espace');
  });

  it('neutralise NaN / Infinity', () => {
    expect(sanitizeMeta({ a: Number.NaN, b: Number.POSITIVE_INFINITY })).toEqual({ a: null, b: null });
  });
});
