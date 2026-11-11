import { createTestDb } from '@/__testutils__/nodeDb';
import type { DbLike } from '@/data/db/types';
import { createSeries, getSeries } from '@/data/repositories/series';
import { createSession, finalizeSession, getSession } from '@/data/repositories/sessions';
import { createVolume, getVolume } from '@/data/repositories/volumes';

import { DeletionError, deleteSession, deleteVolume, summarizeVolumeDeletion, sweepTrash, type TrashOps } from '../deletion';

const T0 = '2026-03-01T10:00:00.000Z';
const rel = (id: string) => `audio/2026/${id}.m4a`;

/** Système de fichiers simulé : fichiers finaux + corbeille, avec pannes injectables. */
function fakeFs(finals: string[]) {
  const final = new Set(finals);
  const trash = new Set<string>();
  const fail = { move: false, purge: false };
  const name = (r: string) => r.split('/').pop()!;
  const ops: TrashOps = {
    async moveToTrash(r) {
      if (fail.move) throw new Error('disque');
      if (!final.has(r)) return false;
      final.delete(r);
      trash.add(name(r));
      return true;
    },
    async restoreFromTrash(r) {
      if (trash.delete(name(r))) final.add(r);
    },
    async purgeFromTrash(r) {
      if (fail.purge) throw new Error('purge');
      trash.delete(name(r));
    },
    listTrash: () => [...trash],
    purgeTrashName: (n) => void trash.delete(n),
    async restoreTrashName(n, r) {
      if (trash.delete(n)) final.add(r);
    },
  };
  return { ops, final, trash, fail };
}

/** Deux livres (dont un dans une série) ; v1 a 2 sessions avec audio, v2 en a 1. */
async function setup() {
  const db = createTestDb();
  await createSeries(db, 'S', { title: 'Saga fictive' }, T0);
  await createVolume(db, 'v1', { title: 'Tome fictif 1', author: 'Auteur Fictif', seriesId: 'S' }, T0);
  await createVolume(db, 'v2', { title: 'Tome fictif 2', author: 'Auteur Fictif', seriesId: 'S' }, T0);
  for (const [id, vol] of [['a', 'v1'], ['b', 'v1'], ['c', 'v2']] as const) {
    await createSession(db, { id, volumeId: vol, startedAt: T0, utcOffset: '+01:00', page: null });
    await finalizeSession(db, id, {
      endedAt: T0,
      durationMs: 60000,
      state: 'completed',
      audio: { path: rel(id), mimeType: 'audio/mp4', bytes: 10, sha256: 'ee'.repeat(32), durationMs: 60000 },
    });
  }
  // Données liées à la session « a » : segment, catégorie, texte indexé.
  db.raw.prepare("INSERT INTO transcript_segments (session_id, seq, text, created_at) VALUES ('a', 1, 'fictif', ?)").run(T0);
  db.raw.prepare("INSERT INTO session_categories (session_id, category_id) VALUES ('a', 'quotes')").run();
  db.raw.prepare("UPDATE reading_sessions SET transcript_text = 'théorie fictive' WHERE id = 'a'").run();
  const fs = fakeFs([rel('a'), rel('b'), rel('c')]);
  return { db, fs };
}

const count = (db: ReturnType<typeof createTestDb>, sql: string) => (db.raw.prepare(sql).get() as { n: number }).n;

/** Fait échouer une requête SQL précise (simulation de panne base de données). */
function failingOn(db: DbLike, fragment: string): DbLike {
  return {
    ...db,
    runAsync: async (sql, params) => {
      if (sql.includes(fragment)) throw new Error('panne simulée');
      return db.runAsync(sql, params);
    },
    withTransactionAsync: (task) => db.withTransactionAsync(task),
  };
}

describe('suppression d’une session', () => {
  it('supprime la session, ses données liées et son audio — et RIEN d’autre', async () => {
    const { db, fs } = await setup();
    await deleteSession(db, fs.ops, 'a');
    expect(await getSession(db, 'a')).toBeNull();
    expect(await getSession(db, 'b')).not.toBeNull();
    expect(await getSession(db, 'c')).not.toBeNull();
    expect(count(db, "SELECT count(*) n FROM transcript_segments WHERE session_id='a'")).toBe(0);
    expect(count(db, "SELECT count(*) n FROM session_categories WHERE session_id='a'")).toBe(0);
    expect(count(db, "SELECT count(*) n FROM sessions_fts WHERE session_id='a'")).toBe(0);
    expect([...fs.final].sort()).toEqual([rel('b'), rel('c')]);
    expect(fs.trash.size).toBe(0); // pas de fichier orphelin
  });

  it('refuse une session en cours d’enregistrement, sans rien modifier', async () => {
    const { db, fs } = await setup();
    await createSession(db, { id: 'live', volumeId: 'v1', startedAt: T0, utcOffset: '+01:00', page: null });
    await expect(deleteSession(db, fs.ops, 'live')).rejects.toMatchObject({ reason: 'active' });
    expect(await getSession(db, 'live')).not.toBeNull();
  });

  it('panne de la base : l’audio est remis en place, la session est intacte', async () => {
    const { db, fs } = await setup();
    await expect(deleteSession(failingOn(db, 'DELETE FROM reading_sessions'), fs.ops, 'a')).rejects.toMatchObject({ reason: 'database' });
    expect(await getSession(db, 'a')).not.toBeNull();
    expect(fs.final.has(rel('a'))).toBe(true);
    expect(fs.trash.size).toBe(0);
  });

  it('panne du fichier : rien n’est supprimé', async () => {
    const { db, fs } = await setup();
    fs.fail.move = true;
    await expect(deleteSession(db, fs.ops, 'a')).rejects.toMatchObject({ reason: 'file' });
    expect(await getSession(db, 'a')).not.toBeNull();
    expect(fs.final.has(rel('a'))).toBe(true);
  });

  it('purge impossible : la session est supprimée, le fichier attend en corbeille et sera purgé au lancement', async () => {
    const { db, fs } = await setup();
    fs.fail.purge = true;
    await deleteSession(db, fs.ops, 'a');
    expect(await getSession(db, 'a')).toBeNull();
    expect([...fs.trash]).toEqual(['a.m4a']);
    expect(await sweepTrash(db, fs.ops)).toEqual({ restored: 0, purged: 1 });
    expect(fs.trash.size).toBe(0);
  });
});

describe('suppression d’un livre', () => {
  it('résumé affiché dans la confirmation', async () => {
    const { db } = await setup();
    expect(await summarizeVolumeDeletion(db, 'v1')).toEqual({ sessionCount: 2, audioCount: 2, totalDurationMs: 120000, activeCount: 0 });
  });

  it('supprime le livre, ses sessions et ses audios ; l’autre tome, ses sessions et la série sont intacts', async () => {
    const { db, fs } = await setup();
    const r = await deleteVolume(db, fs.ops, 'v1');
    expect(r.sessionsDeleted).toBe(2);
    expect(await getVolume(db, 'v1')).toBeNull();
    expect(await getSession(db, 'a')).toBeNull();
    expect(await getSession(db, 'b')).toBeNull();
    expect(await getVolume(db, 'v2')).not.toBeNull();
    expect(await getSession(db, 'c')).not.toBeNull();
    expect(await getSeries(db, 'S')).not.toBeNull();
    expect([...fs.final]).toEqual([rel('c')]);
    expect(fs.trash.size).toBe(0);
  });

  it('panne au milieu de la transaction : tout est annulé et les audios sont remis en place', async () => {
    const { db, fs } = await setup();
    await expect(deleteVolume(failingOn(db, 'DELETE FROM volumes'), fs.ops, 'v1')).rejects.toMatchObject({ reason: 'database' });
    expect(await getVolume(db, 'v1')).not.toBeNull();
    expect(await getSession(db, 'a')).not.toBeNull(); // la suppression des sessions a été annulée
    expect(await getSession(db, 'b')).not.toBeNull();
    expect([...fs.final].sort()).toEqual([rel('a'), rel('b'), rel('c')]);
  });

  it('refuse si un enregistrement est en cours sur ce livre', async () => {
    const { db, fs } = await setup();
    await createSession(db, { id: 'live', volumeId: 'v1', startedAt: T0, utcOffset: '+01:00', page: null });
    await expect(deleteVolume(db, fs.ops, 'v1')).rejects.toBeInstanceOf(DeletionError);
    expect(await getVolume(db, 'v1')).not.toBeNull();
    expect(fs.final.size).toBe(3);
  });
});

describe('réparation au lancement (corbeille)', () => {
  it('restaure l’audio d’une session encore présente (plantage avant la suppression en base)', async () => {
    const { db, fs } = await setup();
    await fs.ops.moveToTrash(rel('b')); // simulation : plantage juste après le déplacement
    expect(await sweepTrash(db, fs.ops)).toEqual({ restored: 1, purged: 0 });
    expect(fs.final.has(rel('b'))).toBe(true);
  });
});
