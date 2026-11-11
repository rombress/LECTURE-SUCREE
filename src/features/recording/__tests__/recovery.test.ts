import { createTestDb } from '@/__testutils__/nodeDb';
import { createSession, getSession } from '@/data/repositories/sessions';
import { createVolume } from '@/data/repositories/volumes';

import { settleAudio, type AudioFileOps } from '../audioStore';
import { recoverUnfinishedSessions } from '../recovery';

/** Système de fichiers simulé : chemins → tailles. */
function fakeFs(initial: { recording?: Record<string, number>; final?: Record<string, number> } = {}) {
  const recording = new Map(Object.entries(initial.recording ?? {}));
  const final = new Map(Object.entries(initial.final ?? {}));
  const deleted: string[] = [];
  const ops: AudioFileOps = {
    recordingSize: (id) => recording.get(id) ?? null,
    finalSize: (rel) => final.get(rel) ?? null,
    async moveRecordingToFinal(id, rel) {
      if (final.has(rel)) throw new Error('existe déjà');
      const size = recording.get(id);
      if (size === undefined) throw new Error('absent');
      recording.delete(id);
      final.set(rel, size);
    },
    sha256: async (rel) => `sha-of-${rel}`,
  };
  return { ops, recording, final, deleted };
}

const T0 = '2026-03-04T20:00:00.000Z';

async function dbWithOpenSession(state: 'recording' | 'paused' = 'recording') {
  const db = createTestDb();
  await createVolume(db, 'v1', { title: 'Tome fictif', author: 'Auteur Fictif' }, T0);
  await createSession(db, { id: 's1', volumeId: 'v1', startedAt: T0, utcOffset: '+01:00', page: null });
  if (state === 'paused') db.raw.prepare("UPDATE reading_sessions SET state='paused', duration_ms=8000").run();
  return db;
}

describe('settleAudio', () => {
  it('déplace l’enregistrement vers son emplacement final et calcule l’empreinte', async () => {
    const fs = fakeFs({ recording: { s1: 5000 } });
    const a = await settleAudio(fs.ops, 's1', T0, 30000);
    expect(a).toEqual({ path: 'audio/2026/s1.m4a', mimeType: 'audio/mp4', bytes: 5000, sha256: 'sha-of-audio/2026/s1.m4a', durationMs: 30000 });
    expect(fs.recording.size).toBe(0);
  });

  it('est idempotente si le fichier a déjà été déplacé (plantage entre déplacement et base)', async () => {
    const fs = fakeFs({ final: { 'audio/2026/s1.m4a': 5000 } });
    expect((await settleAudio(fs.ops, 's1', T0, 1))?.bytes).toBe(5000);
  });

  it('retourne null sans audio', async () => {
    expect(await settleAudio(fakeFs().ops, 's1', T0, 1)).toBeNull();
  });
});

describe('récupération au démarrage (app tuée pendant un enregistrement)', () => {
  it('clôt la session en « interrompue » en CONSERVANT son audio', async () => {
    const db = await dbWithOpenSession('paused');
    const fs = fakeFs({ recording: { s1: 7777 } });
    const r = await recoverUnfinishedSessions(db, fs.ops, T0);
    expect(r).toEqual({ recovered: 1, withAudio: 1, failed: 0 });
    expect(await getSession(db, 's1')).toMatchObject({ state: 'interrupted', durationMs: 8000, audioPath: 'audio/2026/s1.m4a', audioBytes: 7777 });
    expect(fs.final.get('audio/2026/s1.m4a')).toBe(7777);
  });

  it('clôt une session sans fichier comme « sans audio », sans erreur', async () => {
    const db = await dbWithOpenSession();
    const r = await recoverUnfinishedSessions(db, fakeFs().ops, T0);
    expect(r.withAudio).toBe(0);
    expect(await getSession(db, 's1')).toMatchObject({ state: 'interrupted', audioPath: null });
  });

  it('une erreur de fichier n’empêche pas les autres récupérations et ne supprime rien', async () => {
    const db = await dbWithOpenSession();
    await createSession(db, { id: 's2', volumeId: 'v1', startedAt: T0, utcOffset: '+01:00', page: null });
    const fs = fakeFs({ recording: { s1: 10, s2: 20 } });
    const original = fs.ops.moveRecordingToFinal;
    fs.ops.moveRecordingToFinal = async (id, rel) => {
      if (id === 's1') throw new Error('disque plein');
      return original(id, rel);
    };
    const r = await recoverUnfinishedSessions(db, fs.ops, T0);
    expect(r).toEqual({ recovered: 1, withAudio: 1, failed: 1 });
    expect(fs.recording.get('s1')).toBe(10); // fichier intact, re-tenté au prochain lancement
    expect((await getSession(db, 's1'))?.state).toBe('recording');
  });
});
