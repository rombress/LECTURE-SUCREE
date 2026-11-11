import type { DbLike } from '@/data/db/types';
import { finalizeSession, finalizeTranscript, listTranscriptSegments, listUnfinishedSessions } from '@/data/repositories/sessions';
import { log } from '@/services/log';

import { settleAudio, type AudioFileOps } from './audioStore';

/**
 * Texte à conserver après un plantage. Le brouillon (sauvegardé toutes les
 * 5 s) contient aussi l'énoncé en cours, mais peut être plus ancien que les
 * segments, eux écrits immédiatement. On garde le plus complet.
 */
export function pickRecoveredTranscript(draft: string, segments: string[]): string {
  const d = draft.replace(/\s+/g, ' ').trim();
  const seg = segments.join(' ').replace(/\s+/g, ' ').trim();
  if (!seg) return d;
  if (!d) return seg;
  if (d.startsWith(seg)) return d; // brouillon = segments + énoncé en cours
  return seg.length >= d.length ? seg : d;
}

/**
 * Au démarrage : toute session restée « recording »/« paused » (app tuée,
 * plantage, batterie vide) est clôturée en « interrupted ». Son audio est
 * conservé s'il existe : JAMAIS supprimé, même s'il est peut-être incomplet.
 * Une erreur sur une session n'empêche pas la récupération des autres.
 */
export async function recoverUnfinishedSessions(db: DbLike, ops: AudioFileOps, nowIso: string) {
  const pending = await listUnfinishedSessions(db);
  let recovered = 0;
  let withAudio = 0;
  let failed = 0;
  for (const s of pending) {
    try {
      const audio = await settleAudio(ops, s.id, s.startedAt, s.durationMs);
      // Transcription partielle : brouillon (texte en cours compris), sinon segments validés.
      const draft = pickRecoveredTranscript(s.transcriptDraft, await listTranscriptSegments(db, s.id));
      // Session ET texte dans une même transaction : jamais une session close avec un texte perdu.
      await db.withTransactionAsync(async () => {
        await finalizeSession(db, s.id, { endedAt: nowIso, durationMs: s.durationMs, state: 'interrupted', audio });
        if (draft) await finalizeTranscript(db, s.id, { raw: draft, status: 'partial', engine: null, locale: null }, nowIso);
      });
      recovered++;
      if (audio) withAudio++;
    } catch (e) {
      failed++;
      log.error('recovery.session_failed', { kind: e instanceof Error ? e.name : 'unknown' });
    }
  }
  if (pending.length) log.warn('recovery.done', { recovered, withAudio, failed });
  return { recovered, withAudio, failed };
}
