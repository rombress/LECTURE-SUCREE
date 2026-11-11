import { createTestDb } from '@/__testutils__/nodeDb';
import { parseVolumeNumber, validateSeries } from '@/domain/validation';

import { loadLibrary } from '../library';
import { createSeries, getSeries, listSeries, removeSeries, updateSeries } from '../series';
import { createSession, finalizeSession, getSession, listSessionsForVolume } from '../sessions';
import { createVolume, getVolume, listVolumesInSeries, updateVolume, ValidationError } from '../volumes';

const T0 = '2026-02-01T10:00:00.000Z';
const T1 = '2026-02-02T10:00:00.000Z';
const audio = { path: 'audio/2026/s1.m4a', mimeType: 'audio/mp4', bytes: 4000, sha256: 'cd'.repeat(32), durationMs: 30000 };

/** Base dans l'état du MVP validé sur iPhone : livres indépendants + session avec audio. */
async function mvpLikeDb() {
  const db = createTestDb();
  await createVolume(db, 'v1', { title: 'La Cité fictive', author: 'Auteur Fictif', volumeLabel: 'Tome 2', status: 'reading' }, T0);
  await createVolume(db, 'v2', { title: 'La Cité fictive', author: 'Auteur Fictif', volumeLabel: '1' }, T0);
  await createSession(db, { id: 's1', volumeId: 'v1', startedAt: T0, utcOffset: '+01:00', page: 12 });
  await finalizeSession(db, 's1', { endedAt: T0, durationMs: 30000, state: 'completed', audio });
  return db;
}

async function snapshotSessions(db: Awaited<ReturnType<typeof mvpLikeDb>>) {
  return db.raw.prepare('SELECT id, volume_id, audio_path, audio_sha256, duration_ms, state FROM reading_sessions ORDER BY id').all();
}

describe('domaine : séries', () => {
  it('titre de série obligatoire', () => {
    expect(validateSeries({ title: '  ' }).ok).toBe(false);
    expect(validateSeries({ title: 'Saga fictive' }).ok).toBe(true);
  });

  it('position d’un tome déduite de son libellé', () => {
    expect(parseVolumeNumber('3')).toBe(3);
    expect(parseVolumeNumber('Tome 12')).toBe(12);
    expect(parseVolumeNumber('T3')).toBe(3);
    expect(parseVolumeNumber('3,5')).toBe(3.5);
    expect(parseVolumeNumber('Hors-série')).toBeNull();
    expect(parseVolumeNumber(null)).toBeNull();
  });
});

describe('séries et tomes (SQLite réel, données fictives)', () => {
  it('les données existantes du MVP restent intactes et apparaissent comme livres indépendants', async () => {
    const db = await mvpLikeDb();
    const lib = await loadLibrary(db);
    expect(lib.items.map((i) => i.kind)).toEqual(['volume', 'volume']);
    expect(lib.featured?.id).toBe('v1');
    expect((await getSession(db, 's1'))?.audioPath).toBe(audio.path);
  });

  it('crée une série, y range des tomes dans l’ordre de leur numéro', async () => {
    const db = await mvpLikeDb();
    await createSeries(db, 'S', { title: 'Saga fictive', author: 'Auteur Fictif' }, T1);
    await updateVolume(db, 'v1', { title: 'La Cité fictive', author: 'Auteur Fictif', volumeLabel: 'Tome 2', seriesId: 'S' }, T1);
    await updateVolume(db, 'v2', { title: 'La Cité fictive', author: 'Auteur Fictif', volumeLabel: '1', seriesId: 'S' }, T1);
    await createVolume(db, 'v3', { title: 'Récits annexes', author: 'Auteur Fictif', volumeLabel: 'Hors-série', seriesId: 'S' }, T1);
    expect((await listVolumesInSeries(db, 'S')).map((v) => v.id)).toEqual(['v2', 'v1', 'v3']);

    const [s] = await listSeries(db);
    expect(s).toMatchObject({ id: 'S', volumeCount: 3 });
    const lib = await loadLibrary(db);
    expect(lib.items.map((i) => i.key)).toEqual(['s:S']); // plus aucun livre indépendant
  });

  it('déplacer un tome (dans une série, vers une autre, ou en indépendant) ne touche à AUCUNE session', async () => {
    const db = await mvpLikeDb();
    const before = await snapshotSessions(db);
    await createSeries(db, 'A', { title: 'Série A' }, T1);
    await createSeries(db, 'B', { title: 'Série B' }, T1);
    const base = { title: 'La Cité fictive', author: 'Auteur Fictif', volumeLabel: 'Tome 2' };
    await updateVolume(db, 'v1', { ...base, seriesId: 'A' }, T1);
    await updateVolume(db, 'v1', { ...base, seriesId: 'B' }, T1);
    await updateVolume(db, 'v1', { ...base, seriesId: null }, T1);
    expect(await snapshotSessions(db)).toEqual(before);
    expect((await listSessionsForVolume(db, 'v1')).map((s) => s.id)).toEqual(['s1']);
  });

  it('une mise à jour sans série ni couverture précisées les conserve', async () => {
    const db = await mvpLikeDb();
    await createSeries(db, 'A', { title: 'Série A' }, T1);
    await updateVolume(db, 'v1', { title: 'X', author: 'Y', seriesId: 'A', coverPath: 'covers/v1-1.jpg' }, T1);
    const v = await updateVolume(db, 'v1', { title: 'X modifié', author: 'Y' }, T1);
    expect(v).toMatchObject({ seriesId: 'A', coverPath: 'covers/v1-1.jpg', title: 'X modifié' });
  });

  it('retirer une série ne supprime NI ses tomes NI leurs sessions NI leurs audios', async () => {
    const db = await mvpLikeDb();
    const before = await snapshotSessions(db);
    await createSeries(db, 'S', { title: 'Saga fictive' }, T1);
    await updateVolume(db, 'v1', { title: 'La Cité fictive', author: 'Auteur Fictif', seriesId: 'S' }, T1);
    await updateVolume(db, 'v2', { title: 'La Cité fictive', author: 'Auteur Fictif', seriesId: 'S' }, T1);
    expect(await removeSeries(db, 'S', T1)).toBe(2);
    expect(await getSeries(db, 'S')).toBeNull();
    expect((await getVolume(db, 'v1'))?.seriesId).toBeNull();
    expect((await getVolume(db, 'v2'))?.seriesId).toBeNull();
    expect(await snapshotSessions(db)).toEqual(before);
    expect((await loadLibrary(db)).items.map((i) => i.kind)).toEqual(['volume', 'volume']);
  });

  it('le retrait reste sans perte même si les clés étrangères étaient désactivées', async () => {
    const db = await mvpLikeDb();
    await createSeries(db, 'S', { title: 'Saga fictive' }, T1);
    await updateVolume(db, 'v1', { title: 'La Cité fictive', author: 'Auteur Fictif', seriesId: 'S' }, T1);
    db.raw.exec('PRAGMA foreign_keys = OFF');
    await removeSeries(db, 'S', T1);
    expect((await getVolume(db, 'v1'))?.seriesId).toBeNull(); // pas de tome orphelin invisible
  });

  it('rattacher un tome à une série inexistante est refusé sans rien modifier', async () => {
    const db = await mvpLikeDb();
    await expect(updateVolume(db, 'v1', { title: 'X', author: 'Y', seriesId: 'inexistante' }, T1)).rejects.toThrow(/FOREIGN KEY/);
    expect((await getVolume(db, 'v1'))?.title).toBe('La Cité fictive');
  });

  it('couverture de série : la sienne, sinon celle du premier tome illustré', async () => {
    const db = await mvpLikeDb();
    await createSeries(db, 'S', { title: 'Saga fictive' }, T1);
    await updateVolume(db, 'v2', { title: 'T', author: 'A', volumeLabel: '1', seriesId: 'S', coverPath: 'covers/v2-1.jpg' }, T1);
    expect((await listSeries(db))[0]?.displayCoverPath).toBe('covers/v2-1.jpg');
    await updateSeries(db, 'S', { title: 'Saga fictive', coverPath: 'covers/S-1.jpg' }, T1);
    expect((await listSeries(db))[0]?.displayCoverPath).toBe('covers/S-1.jpg');
  });

  it('refuse une série sans titre', async () => {
    const db = createTestDb();
    await expect(createSeries(db, 'S', { title: '' }, T0)).rejects.toBeInstanceOf(ValidationError);
  });
});
