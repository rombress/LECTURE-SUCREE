import { createTestDb } from '@/__testutils__/nodeDb';

import {
  createSession,
  finalizeSession,
  getSession,
  listRecentSessions,
  listSessionsForVolume,
  listUnfinishedSessions,
  touchSession,
} from '../sessions';
import { createVolume, getVolume, listVolumes, updateVolume, ValidationError } from '../volumes';

const T0 = '2026-01-10T09:00:00.000Z';
const audio = { path: 'audio/2026/s1.m4a', mimeType: 'audio/mp4', bytes: 1234, sha256: 'ab'.repeat(32), durationMs: 30000 };

describe('dépôt des tomes (SQLite réel, données fictives)', () => {
  it('crée, relit et modifie une fiche', async () => {
    const db = createTestDb();
    const v = await createVolume(db, 'v1', { title: '  Le Jardin des Fictions ', author: 'A. Exemple', pageCount: 300, volumeLabel: ' ' }, T0);
    expect(v).toMatchObject({ title: 'Le Jardin des Fictions', author: 'A. Exemple', pageCount: 300, currentPage: 0, status: 'to_read', volumeLabel: null });
    const u = await updateVolume(db, 'v1', { title: 'Le Jardin des Fictions', author: 'A. Exemple', pageCount: 300, currentPage: 120, status: 'reading' }, T0);
    expect(u.currentPage).toBe(120);
    expect(u.status).toBe('reading');
    expect((await getVolume(db, 'v1'))?.status).toBe('reading');
  });

  it('refuse une fiche invalide sans rien écrire', async () => {
    const db = createTestDb();
    await expect(createVolume(db, 'v1', { title: '', author: 'X' }, T0)).rejects.toBeInstanceOf(ValidationError);
    expect(await listVolumes(db)).toEqual([]);
  });

  it('liste les tomes avec le nombre de sessions, le plus récemment actif d’abord', async () => {
    const db = createTestDb();
    await createVolume(db, 'a', { title: 'Alpha', author: 'X' }, '2026-01-01T00:00:00.000Z');
    await createVolume(db, 'b', { title: 'Beta', author: 'Y' }, '2026-01-02T00:00:00.000Z');
    await createSession(db, { id: 's1', volumeId: 'a', startedAt: '2026-01-05T00:00:00.000Z', utcOffset: '+01:00', page: null });
    const list = await listVolumes(db);
    expect(list.map((v) => v.id)).toEqual(['a', 'b']);
    expect(list[0]?.sessionCount).toBe(1);
  });
});

describe('dépôt des sessions', () => {
  async function setup() {
    const db = createTestDb();
    await createVolume(db, 'v1', { title: 'Tome fictif', author: 'Auteur Fictif' }, T0);
    return db;
  }

  it('cycle complet : création (avant capture) → sauvegarde régulière → finalisation avec audio', async () => {
    const db = await setup();
    await createSession(db, { id: 's1', volumeId: 'v1', startedAt: T0, utcOffset: '+01:00', page: 42 });
    expect(await listUnfinishedSessions(db)).toHaveLength(1);
    await touchSession(db, 's1', 12000, 'paused', T0);
    expect((await getSession(db, 's1'))?.durationMs).toBe(12000);
    await finalizeSession(db, 's1', { endedAt: T0, durationMs: 30000, state: 'completed', audio });
    const s = await getSession(db, 's1');
    expect(s).toMatchObject({ state: 'completed', durationMs: 30000, page: 42, audioPath: audio.path, audioSha256: audio.sha256 });
    expect(await listUnfinishedSessions(db)).toHaveLength(0);
  });

  it('l’audio original ne peut JAMAIS être réattaché ou écrasé', async () => {
    const db = await setup();
    await createSession(db, { id: 's1', volumeId: 'v1', startedAt: T0, utcOffset: '+01:00', page: null });
    await finalizeSession(db, 's1', { endedAt: T0, durationMs: 1, state: 'completed', audio });
    await expect(
      finalizeSession(db, 's1', { endedAt: T0, durationMs: 1, state: 'completed', audio: { ...audio, path: 'audio/2026/autre.m4a' } }),
    ).rejects.toThrow(/déjà finalisée/);
    expect((await getSession(db, 's1'))?.audioPath).toBe(audio.path);
  });

  it('la sauvegarde régulière ne rouvre pas une session terminée', async () => {
    const db = await setup();
    await createSession(db, { id: 's1', volumeId: 'v1', startedAt: T0, utcOffset: '+01:00', page: null });
    await finalizeSession(db, 's1', { endedAt: T0, durationMs: 5000, state: 'completed', audio });
    await touchSession(db, 's1', 99999, 'recording', T0);
    expect(await getSession(db, 's1')).toMatchObject({ state: 'completed', durationMs: 5000 });
  });

  it('chaque session reste associée à son livre ; historiques triés du plus récent au plus ancien', async () => {
    const db = await setup();
    await createVolume(db, 'v2', { title: 'Autre tome', author: 'Auteur Fictif' }, T0);
    await createSession(db, { id: 'old', volumeId: 'v1', startedAt: '2026-01-01T10:00:00.000Z', utcOffset: '+01:00', page: null });
    await createSession(db, { id: 'new', volumeId: 'v1', startedAt: '2026-02-01T10:00:00.000Z', utcOffset: '+01:00', page: null });
    await createSession(db, { id: 'other', volumeId: 'v2', startedAt: '2026-01-15T10:00:00.000Z', utcOffset: '+01:00', page: null });
    expect((await listSessionsForVolume(db, 'v1')).map((s) => s.id)).toEqual(['new', 'old']);
    expect((await listSessionsForVolume(db, 'v2')).map((s) => s.volumeTitle)).toEqual(['Autre tome']);
    expect((await listRecentSessions(db)).map((s) => s.id)).toEqual(['new', 'other', 'old']);
  });

  it('refuse une session sur un livre inexistant ou une page invalide', async () => {
    const db = await setup();
    await expect(createSession(db, { id: 's', volumeId: 'nope', startedAt: T0, utcOffset: '+01:00', page: null })).rejects.toThrow();
    await expect(createSession(db, { id: 's', volumeId: 'v1', startedAt: T0, utcOffset: '+01:00', page: -3 })).rejects.toThrow();
  });
});
