import type { AudioAsset, Id, SessionState, TranscriptStatus } from '@/domain/models';

import type { DbLike } from '../db/types';

/**
 * Sessions de lecture (MVP : audio seul, sans transcription).
 *
 * Cycle : createSession (state=recording, AVANT la capture) → touchDuration
 * (sauvegarde régulière) → finalizeSession (state=completed, audio + SHA-256)
 * ou markInterrupted (récupération au démarrage).
 *
 * Une fois `audio_path` renseigné, il n'est JAMAIS réécrit : la requête de
 * finalisation l'exige à NULL (« audio_path IS NULL »).
 */

export interface SessionSummary {
  id: Id;
  volumeId: Id;
  volumeTitle: string;
  volumeAuthor: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  page: number | null;
  state: SessionState;
  audioPath: string | null;
  audioBytes: number | null;
  audioSha256: string | null;
  /** Texte affiché/exporté (corrigeable par l'utilisateur). */
  transcriptText: string;
  transcriptStatus: TranscriptStatus;
}

interface Row {
  id: string;
  volume_id: string;
  volume_title: string;
  volume_author: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number;
  page: number | null;
  state: SessionState;
  audio_path: string | null;
  audio_bytes: number | null;
  audio_sha256: string | null;
  transcript_text: string;
  transcript_status: TranscriptStatus;
}

const SELECT = `SELECT s.id, s.volume_id, v.title AS volume_title, v.author AS volume_author, s.started_at, s.ended_at,
                       s.duration_ms, s.page, s.state, s.audio_path, s.audio_bytes, s.audio_sha256,
                       s.transcript_text, s.transcript_status
                  FROM reading_sessions s JOIN volumes v ON v.id = s.volume_id`;

function toSummary(r: Row): SessionSummary {
  return {
    id: r.id,
    volumeId: r.volume_id,
    volumeTitle: r.volume_title,
    volumeAuthor: r.volume_author,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationMs: r.duration_ms,
    page: r.page,
    state: r.state,
    audioPath: r.audio_path,
    audioBytes: r.audio_bytes,
    audioSha256: r.audio_sha256,
    transcriptText: r.transcript_text,
    transcriptStatus: r.transcript_status,
  };
}

function checkPage(page: number | null) {
  if (page !== null && (!Number.isInteger(page) || page < 0)) throw new Error('Numéro de page invalide');
}

export async function createSession(
  db: DbLike,
  s: { id: Id; volumeId: Id; startedAt: string; utcOffset: string; page: number | null },
): Promise<void> {
  checkPage(s.page);
  await db.runAsync(
    `INSERT INTO reading_sessions (id, volume_id, started_at, utc_offset, page, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'recording', ?, ?)`,
    [s.id, s.volumeId, s.startedAt, s.utcOffset, s.page, s.startedAt, s.startedAt],
  );
}

/** Sauvegarde régulière de l'avancement (durée, état) pendant l'enregistrement. */
export async function touchSession(db: DbLike, id: Id, durationMs: number, state: 'recording' | 'paused', nowIso: string) {
  await db.runAsync(
    `UPDATE reading_sessions SET duration_ms = ?, state = ?, updated_at = ?
      WHERE id = ? AND state IN ('recording','paused')`,
    [Math.max(0, Math.round(durationMs)), state, nowIso, id],
  );
}

export async function updateSessionPage(db: DbLike, id: Id, page: number | null, nowIso: string) {
  checkPage(page);
  await db.runAsync('UPDATE reading_sessions SET page = ?, updated_at = ? WHERE id = ?', [page, nowIso, id]);
}

/**
 * Attache l'audio finalisé et clôt la session. Refuse d'écraser un audio déjà
 * attaché (garantie « l'audio original n'est jamais modifié »).
 */
export async function finalizeSession(
  db: DbLike,
  id: Id,
  f: { endedAt: string; durationMs: number; state: 'completed' | 'interrupted'; audio: AudioAsset | null },
): Promise<void> {
  const res = await db.runAsync(
    `UPDATE reading_sessions
        SET ended_at = ?, duration_ms = ?, state = ?,
            audio_path = ?, audio_mime = ?, audio_bytes = ?, audio_sha256 = ?, audio_duration_ms = ?,
            updated_at = ?
      WHERE id = ? AND audio_path IS NULL AND state IN ('recording','paused')`,
    [
      f.endedAt,
      Math.max(0, Math.round(f.durationMs)),
      f.state,
      f.audio?.path ?? null,
      f.audio?.mimeType ?? null,
      f.audio?.bytes ?? null,
      f.audio?.sha256 ?? null,
      f.audio ? Math.round(f.audio.durationMs) : null,
      f.endedAt,
      id,
    ],
  );
  if (res.changes !== 1) throw new Error('Session déjà finalisée ou introuvable');
}

/** Sessions restées ouvertes (app tuée, plantage) : à récupérer au démarrage. */
export async function listUnfinishedSessions(
  db: DbLike,
): Promise<{ id: Id; startedAt: string; durationMs: number; transcriptDraft: string }[]> {
  const rows = await db.getAllAsync<{ id: string; started_at: string; duration_ms: number; transcript_raw: string }>(
    "SELECT id, started_at, duration_ms, transcript_raw FROM reading_sessions WHERE state IN ('recording','paused')",
    [],
  );
  return rows.map((r) => ({ id: r.id, startedAt: r.started_at, durationMs: r.duration_ms, transcriptDraft: r.transcript_raw }));
}

/** Historique d'un tome, du plus récent au plus ancien. */
export async function listSessionsForVolume(db: DbLike, volumeId: Id): Promise<SessionSummary[]> {
  const rows = await db.getAllAsync<Row>(`${SELECT} WHERE s.volume_id = ? ORDER BY s.started_at DESC`, [volumeId]);
  return rows.map(toSummary);
}

/** Historique global, du plus récent au plus ancien. */
export async function listRecentSessions(db: DbLike, limit = 200): Promise<SessionSummary[]> {
  const rows = await db.getAllAsync<Row>(`${SELECT} ORDER BY s.started_at DESC LIMIT ?`, [limit]);
  return rows.map(toSummary);
}

export async function getSession(db: DbLike, id: Id): Promise<SessionSummary | null> {
  const r = await db.getFirstAsync<Row>(`${SELECT} WHERE s.id = ?`, [id]);
  return r ? toSummary(r) : null;
}

/**
 * Supprime UNE session terminée (ses segments et catégories partent en
 * cascade ; l'index plein texte est mis à jour par trigger). Refuse une
 * session en cours d'enregistrement. Le fichier audio est géré par l'appelant
 * (features/deletion). Retourne true si la ligne a été supprimée.
 */
export async function deleteSessionRow(db: DbLike, id: Id): Promise<boolean> {
  const res = await db.runAsync("DELETE FROM reading_sessions WHERE id = ? AND state IN ('completed','interrupted')", [id]);
  return res.changes === 1;
}

/** Sessions d'un tome avec leur audio (pour la confirmation et la suppression). */
export async function listSessionAudioForVolume(
  db: DbLike,
  volumeId: Id,
): Promise<{ id: Id; audioPath: string | null; durationMs: number; state: SessionState }[]> {
  const rows = await db.getAllAsync<{ id: string; audio_path: string | null; duration_ms: number; state: SessionState }>(
    'SELECT id, audio_path, duration_ms, state FROM reading_sessions WHERE volume_id = ?',
    [volumeId],
  );
  return rows.map((r) => ({ id: r.id, audioPath: r.audio_path, durationMs: r.duration_ms, state: r.state }));
}

// ---------------------------------------------------------------------------
// Transcription (aucune de ces fonctions ne touche à l'audio)
// ---------------------------------------------------------------------------

/** Sauvegarde immédiate d'un énoncé validé (ajout seul, pendant l'enregistrement). */
export async function appendTranscriptSegment(db: DbLike, sessionId: Id, seq: number, text: string, nowIso: string) {
  await db.runAsync('INSERT INTO transcript_segments (session_id, seq, text, is_final, created_at) VALUES (?, ?, ?, 1, ?)', [
    sessionId,
    seq,
    text,
    nowIso,
  ]);
}

export async function listTranscriptSegments(db: DbLike, sessionId: Id): Promise<string[]> {
  const rows = await db.getAllAsync<{ text: string }>('SELECT text FROM transcript_segments WHERE session_id = ? ORDER BY seq', [sessionId]);
  return rows.map((r) => r.text);
}

/** Brouillon régulier (texte en cours compris) pendant l'enregistrement. */
export async function saveTranscriptDraft(db: DbLike, id: Id, raw: string, nowIso: string) {
  await db.runAsync(
    `UPDATE reading_sessions SET transcript_raw = ?, transcript_status = 'partial', updated_at = ?
      WHERE id = ? AND state IN ('recording','paused')`,
    [raw, nowIso, id],
  );
}

/**
 * Clôt la transcription d'une session TERMINÉE. Le texte affiché n'est
 * rempli que s'il est vide : une correction de l'utilisateur n'est jamais
 * écrasée.
 */
export async function finalizeTranscript(
  db: DbLike,
  id: Id,
  t: { raw: string; status: TranscriptStatus; engine: string | null; locale: string | null },
  nowIso: string,
) {
  await db.runAsync(
    `UPDATE reading_sessions
        SET transcript_raw = ?, transcript_status = ?, transcription_engine = ?, locale = ?,
            transcript_text = CASE WHEN transcript_text = '' THEN ? ELSE transcript_text END,
            updated_at = ?
      WHERE id = ? AND state IN ('completed','interrupted')`,
    [t.raw, t.status, t.engine, t.locale, t.raw, nowIso, id],
  );
}

/**
 * Retranscription depuis l'audio, demandée explicitement : remplace le texte
 * brut ET le texte affiché. N'écrit QUE si le texte affiché n'a pas changé
 * depuis la demande (`expectedText`) : une correction faite entre-temps n'est
 * jamais écrasée (relecture du 2026-11-11, bug 6). Retourne false sinon.
 */
export async function replaceTranscriptFromAudio(
  db: DbLike,
  id: Id,
  t: { raw: string; engine: string; locale: string; complete: boolean; expectedText: string },
  nowIso: string,
): Promise<boolean> {
  const res = await db.runAsync(
    `UPDATE reading_sessions
        SET transcript_raw = ?, transcript_text = ?, transcript_status = ?, transcription_engine = ?, locale = ?, updated_at = ?
      WHERE id = ? AND state IN ('completed','interrupted') AND transcript_text = ?`,
    [t.raw, t.raw, t.complete ? 'complete' : 'partial', t.engine, t.locale, nowIso, id, t.expectedText],
  );
  return res.changes === 1;
}

/** Correction manuelle du texte. Ne touche ni l'audio, ni le texte brut du moteur. */
export async function updateTranscriptText(db: DbLike, id: Id, text: string, nowIso: string) {
  const res = await db.runAsync(
    `UPDATE reading_sessions SET transcript_text = ?, updated_at = ?
      WHERE id = ? AND state IN ('completed','interrupted')`,
    [text, nowIso, id],
  );
  if (res.changes !== 1) throw new Error('Session introuvable ou en cours');
}

export async function getTranscriptRaw(db: DbLike, id: Id): Promise<string | null> {
  const r = await db.getFirstAsync<{ transcript_raw: string }>('SELECT transcript_raw FROM reading_sessions WHERE id = ?', [id]);
  return r ? r.transcript_raw : null;
}
