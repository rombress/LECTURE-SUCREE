import { createTestDb } from '@/__testutils__/nodeDb';
import type { AudioFileOps } from '@/features/recording/audioStore';
import { pickRecoveredTranscript, recoverUnfinishedSessions } from '@/features/recording/recovery';

import {
  appendTranscriptSegment,
  createSession,
  finalizeSession,
  finalizeTranscript,
  getSession,
  getTranscriptRaw,
  listTranscriptSegments,
  replaceTranscriptFromAudio,
  saveTranscriptDraft,
  updateTranscriptText,
} from '../sessions';
import { createVolume } from '../volumes';

const T0 = '2026-04-01T18:00:00.000Z';
const audio = { path: 'audio/2026/s1.m4a', mimeType: 'audio/mp4', bytes: 99, sha256: 'ab'.repeat(32), durationMs: 5000 };
const noFiles: AudioFileOps = {
  recordingSize: () => null,
  finalSize: () => null,
  moveRecordingToFinal: async () => undefined,
  sha256: async () => 'x',
};

async function setup() {
  const db = createTestDb();
  await createVolume(db, 'v1', { title: 'Tome fictif', author: 'Auteur Fictif' }, T0);
  await createSession(db, { id: 's1', volumeId: 'v1', startedAt: T0, utcOffset: '+02:00', page: null });
  return db;
}

const search = (db: ReturnType<typeof createTestDb>, q: string) =>
  (db.raw.prepare('SELECT session_id FROM sessions_fts WHERE sessions_fts MATCH ?').all(q) as { session_id: string }[]).map((r) => r.session_id);

describe('persistance de la transcription', () => {
  it('cycle complet : segments → brouillon → finalisation → texte affiché + recherche', async () => {
    const db = await setup();
    await appendTranscriptSegment(db, 's1', 1, 'Le narrateur ment.', T0);
    await appendTranscriptSegment(db, 's1', 2, 'Il cache une théorie.', T0);
    await saveTranscriptDraft(db, 's1', 'Le narrateur ment. Il cache une théorie. Et puis', T0);
    expect(await listTranscriptSegments(db, 's1')).toEqual(['Le narrateur ment.', 'Il cache une théorie.']);
    expect((await getSession(db, 's1'))?.transcriptStatus).toBe('partial');

    await finalizeSession(db, 's1', { endedAt: T0, durationMs: 5000, state: 'completed', audio });
    await finalizeTranscript(db, 's1', { raw: 'Le narrateur ment. Il cache une théorie.', status: 'complete', engine: 'ios-sfspeech-ondevice', locale: 'fr-FR' }, T0);
    const s = await getSession(db, 's1');
    expect(s).toMatchObject({ transcriptText: 'Le narrateur ment. Il cache une théorie.', transcriptStatus: 'complete' });
    expect(search(db, 'theorie')).toEqual(['s1']); // index plein texte à jour, sans accents
  });

  it('corriger le texte ne touche NI l’audio NI le texte brut du moteur', async () => {
    const db = await setup();
    await finalizeSession(db, 's1', { endedAt: T0, durationMs: 5000, state: 'completed', audio });
    await finalizeTranscript(db, 's1', { raw: 'texte brut', status: 'complete', engine: 'e', locale: 'fr-FR' }, T0);
    await updateTranscriptText(db, 's1', 'Texte corrigé à la main', T0);
    const s = await getSession(db, 's1');
    expect(s).toMatchObject({ transcriptText: 'Texte corrigé à la main', audioPath: audio.path, audioSha256: audio.sha256, audioBytes: 99 });
    expect(await getTranscriptRaw(db, 's1')).toBe('texte brut');
    expect(search(db, 'corrige')).toEqual(['s1']);
  });

  it('une finalisation tardive n’écrase jamais une correction de l’utilisateur', async () => {
    const db = await setup();
    await finalizeSession(db, 's1', { endedAt: T0, durationMs: 1, state: 'completed', audio });
    await updateTranscriptText(db, 's1', 'Ma correction', T0);
    await finalizeTranscript(db, 's1', { raw: 'sortie moteur', status: 'complete', engine: 'e', locale: 'fr-FR' }, T0);
    expect((await getSession(db, 's1'))?.transcriptText).toBe('Ma correction');
  });

  it('impossible de modifier le texte d’une session encore en cours', async () => {
    const db = await setup();
    await expect(updateTranscriptText(db, 's1', 'x', T0)).rejects.toThrow();
  });

  it('retranscription depuis l’audio (demande explicite) : remplace texte et brut, audio intact', async () => {
    const db = await setup();
    await finalizeSession(db, 's1', { endedAt: T0, durationMs: 1, state: 'completed', audio });
    const ok = await replaceTranscriptFromAudio(
      db,
      's1',
      { raw: 'Nouvelle transcription.', engine: 'ios-sfspeech-ondevice', locale: 'fr-FR', complete: true, expectedText: '' },
      T0,
    );
    expect(ok).toBe(true);
    expect(await getSession(db, 's1')).toMatchObject({ transcriptText: 'Nouvelle transcription.', transcriptStatus: 'complete', audioPath: audio.path });
  });

  it('BUG 5 — retranscription partielle enregistrée comme « partial »', async () => {
    const db = await setup();
    await finalizeSession(db, 's1', { endedAt: T0, durationMs: 1, state: 'completed', audio });
    await replaceTranscriptFromAudio(db, 's1', { raw: 'Début seulement', engine: 'e', locale: 'fr-FR', complete: false, expectedText: '' }, T0);
    expect((await getSession(db, 's1'))?.transcriptStatus).toBe('partial');
  });

  it('BUG 6 — une correction faite PENDANT la retranscription n’est pas écrasée', async () => {
    const db = await setup();
    await finalizeSession(db, 's1', { endedAt: T0, durationMs: 1, state: 'completed', audio });
    // La retranscription a été demandée alors que le texte était vide…
    await updateTranscriptText(db, 's1', 'Corrigé entre-temps', T0); // … puis l'utilisateur corrige
    const ok = await replaceTranscriptFromAudio(db, 's1', { raw: 'Sortie moteur', engine: 'e', locale: 'fr-FR', complete: true, expectedText: '' }, T0);
    expect(ok).toBe(false);
    expect((await getSession(db, 's1'))?.transcriptText).toBe('Corrigé entre-temps');
  });

  it('le brouillon n’est plus modifiable après la fin de la session', async () => {
    const db = await setup();
    await finalizeSession(db, 's1', { endedAt: T0, durationMs: 1, state: 'completed', audio });
    await saveTranscriptDraft(db, 's1', 'tardif', T0);
    expect(await getTranscriptRaw(db, 's1')).toBe('');
  });
});

describe('récupération après plantage (transcription)', () => {
  it('garde le texte le plus complet entre brouillon et segments', () => {
    expect(pickRecoveredTranscript('A. B. en cours', ['A.', 'B.'])).toBe('A. B. en cours');
    expect(pickRecoveredTranscript('A.', ['A.', 'B.', 'C.'])).toBe('A. B. C.'); // brouillon plus ancien
    expect(pickRecoveredTranscript('', ['A.'])).toBe('A.');
    expect(pickRecoveredTranscript('  ', [])).toBe('');
  });

  it('une session interrompue garde sa transcription partielle', async () => {
    const db = await setup();
    await appendTranscriptSegment(db, 's1', 1, 'Avant le plantage.', T0);
    await saveTranscriptDraft(db, 's1', 'Avant le plantage. Et encore', T0);
    await recoverUnfinishedSessions(db, noFiles, T0);
    expect(await getSession(db, 's1')).toMatchObject({
      state: 'interrupted',
      transcriptStatus: 'partial',
      transcriptText: 'Avant le plantage. Et encore',
    });
  });
});
