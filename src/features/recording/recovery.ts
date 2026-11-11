import type { DbLike } from '@/data/db/types';
import { finalizeSession, listUnfinishedSessions } from '@/data/repositories/sessions';
import { log } from '@/services/log';

import { settleAudio, type AudioFileOps } from './audioStore';

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
      await finalizeSession(db, s.id, { endedAt: nowIso, durationMs: s.durationMs, state: 'interrupted', audio });
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
