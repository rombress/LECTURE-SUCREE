/**
 * Suppressions définitives (session, tome) avec cohérence base ↔ fichiers.
 *
 * Protocole « corbeille » (aucun fichier orphelin, aucune session sans audio) :
 *   1. Les fichiers audio concernés sont DÉPLACÉS dans une corbeille privée
 *      (Documents/lecture-sucree/trash/), pas encore supprimés.
 *   2. Les lignes sont supprimées en base (transaction pour un tome).
 *      → En cas d'échec : les fichiers sont REMIS en place, rien n'est perdu.
 *   3. La corbeille est vidée.
 *      → En cas d'échec : fichiers purgés au prochain lancement (sweepTrash).
 * Un plantage entre deux étapes est réparé au lancement par sweepTrash :
 * si la session existe encore, son audio est restauré ; sinon il est purgé.
 */
import type { DbLike } from '@/data/db/types';
import { deleteSessionRow, getSession, listSessionAudioForVolume } from '@/data/repositories/sessions';
import { deleteVolumeWithSessions, getVolume } from '@/data/repositories/volumes';
import { log } from '@/services/log';

/** Opérations fichiers de la corbeille (injectables en test). */
export interface TrashOps {
  /** Déplace un audio (chemin relatif) dans la corbeille ; retourne false s'il n'existe pas. */
  moveToTrash(audioRel: string): Promise<boolean>;
  /** Remet un audio de la corbeille à son emplacement d'origine. */
  restoreFromTrash(audioRel: string): Promise<void>;
  /** Supprime définitivement l'audio de la corbeille. */
  purgeFromTrash(audioRel: string): Promise<void>;
  /** Noms des fichiers présents dans la corbeille (« <sessionId>.<ext> »). */
  listTrash(): string[];
  /** Supprime un fichier de la corbeille par son nom (purge au démarrage). */
  purgeTrashName(name: string): void;
  /** Restaure un fichier de la corbeille vers un chemin relatif. */
  restoreTrashName(name: string, audioRel: string): Promise<void>;
}

export class DeletionError extends Error {
  constructor(
    public readonly reason: 'not_found' | 'active' | 'file' | 'database',
    message: string,
  ) {
    super(message);
    this.name = 'DeletionError';
  }
}

/** Supprime UNE session et son audio. Aucune autre session n'est touchée. */
export async function deleteSession(db: DbLike, ops: TrashOps, sessionId: string): Promise<void> {
  const s = await getSession(db, sessionId);
  if (!s) throw new DeletionError('not_found', 'Session introuvable');
  if (s.state === 'recording' || s.state === 'paused') throw new DeletionError('active', 'Session en cours d’enregistrement');

  let trashed = false;
  if (s.audioPath) {
    try {
      trashed = await ops.moveToTrash(s.audioPath);
    } catch {
      throw new DeletionError('file', 'Le fichier audio n’a pas pu être déplacé ; rien n’a été supprimé');
    }
  }
  let deleted = false;
  try {
    deleted = await deleteSessionRow(db, sessionId);
  } catch {
    deleted = false;
  }
  if (!deleted) {
    if (trashed && s.audioPath) await ops.restoreFromTrash(s.audioPath);
    throw new DeletionError('database', 'La session n’a pas pu être supprimée ; l’audio a été remis en place');
  }
  if (trashed && s.audioPath) {
    await ops.purgeFromTrash(s.audioPath).catch(() => log.warn('deletion.purge_deferred'));
  }
  log.info('deletion.session_deleted', { hadAudio: trashed });
}

export interface VolumeDeletionSummary {
  sessionCount: number;
  audioCount: number;
  totalDurationMs: number;
  activeCount: number;
}

/** Ce que la suppression d'un tome emporterait (affiché dans la confirmation). */
export async function summarizeVolumeDeletion(db: DbLike, volumeId: string): Promise<VolumeDeletionSummary> {
  const sessions = await listSessionAudioForVolume(db, volumeId);
  return {
    sessionCount: sessions.length,
    audioCount: sessions.filter((s) => s.audioPath).length,
    totalDurationMs: sessions.reduce((t, s) => t + s.durationMs, 0),
    activeCount: sessions.filter((s) => s.state === 'recording' || s.state === 'paused').length,
  };
}

/**
 * Supprime un tome, ses sessions et leurs audios. Tout ou rien côté base ;
 * les audios sont restaurés si la base échoue. Retourne le chemin de la
 * couverture à supprimer ensuite (copie privée de l'app).
 */
export async function deleteVolume(db: DbLike, ops: TrashOps, volumeId: string): Promise<{ sessionsDeleted: number; coverPath: string | null }> {
  const volume = await getVolume(db, volumeId);
  if (!volume) throw new DeletionError('not_found', 'Tome introuvable');
  const sessions = await listSessionAudioForVolume(db, volumeId);
  if (sessions.some((s) => s.state === 'recording' || s.state === 'paused')) {
    throw new DeletionError('active', 'Un enregistrement est en cours sur ce tome');
  }

  const trashed: string[] = [];
  const restoreAll = async () => {
    for (const rel of trashed) await ops.restoreFromTrash(rel).catch(() => log.error('deletion.restore_failed'));
  };
  try {
    for (const s of sessions) {
      if (s.audioPath && (await ops.moveToTrash(s.audioPath))) trashed.push(s.audioPath);
    }
  } catch {
    await restoreAll();
    throw new DeletionError('file', 'Un fichier audio n’a pas pu être déplacé ; rien n’a été supprimé');
  }

  let sessionsDeleted: number;
  try {
    ({ sessionsDeleted } = await deleteVolumeWithSessions(db, volumeId));
  } catch {
    await restoreAll();
    throw new DeletionError('database', 'Le tome n’a pas pu être supprimé ; tous les audios ont été remis en place');
  }
  for (const rel of trashed) await ops.purgeFromTrash(rel).catch(() => log.warn('deletion.purge_deferred'));
  log.info('deletion.volume_deleted', { sessions: sessionsDeleted, audios: trashed.length });
  return { sessionsDeleted, coverPath: volume.coverPath };
}

/**
 * Au lancement : répare une suppression interrompue. Pour chaque fichier de
 * la corbeille, si sa session existe encore (la base n'a pas été modifiée),
 * l'audio est restauré ; sinon il est purgé.
 */
export async function sweepTrash(db: DbLike, ops: TrashOps): Promise<{ restored: number; purged: number }> {
  let restored = 0;
  let purged = 0;
  for (const name of ops.listTrash()) {
    const sessionId = name.replace(/\.[^.]+$/, '');
    try {
      const s = await getSession(db, sessionId);
      if (s?.audioPath) {
        await ops.restoreTrashName(name, s.audioPath);
        restored++;
      } else {
        ops.purgeTrashName(name);
        purged++;
      }
    } catch {
      log.error('deletion.sweep_item_failed');
    }
  }
  if (restored || purged) log.warn('deletion.sweep_done', { restored, purged });
  return { restored, purged };
}
