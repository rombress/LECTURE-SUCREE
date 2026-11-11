/**
 * Export d'un audio de session via le menu Partager d'iOS (Enregistrer dans
 * Fichiers, Google Drive, AirDrop…). Aucun envoi n'a lieu sans le choix
 * explicite de l'utilisateur dans le menu système.
 *
 * L'ORIGINAL n'est jamais touché : on partage une COPIE temporaire (cache),
 * au nom lisible, dont l'empreinte SHA-256 est vérifiée avant le partage.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { SessionSummary } from '@/data/repositories/sessions';
import { APP_DIR, Dirs } from '@/data/files/paths';

import { AUDIO_EXT, finalFile } from './audioStore';

/** « Lecture sucrée - <Titre> - 2026-11-11 21h05.m4a » (heure locale, caractères interdits retirés). */
export function exportFileName(volumeTitle: string, startedAtIso: string, ext: string = AUDIO_EXT): string {
  const d = new Date(startedAtIso);
  const p = (n: number) => String(n).padStart(2, '0');
  const when = Number.isNaN(d.getTime())
    ? 'date inconnue'
    : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}`;
  const title =
    volumeTitle
      .replace(/[\u0000-\u001f/\\:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
      .trim() || 'Sans titre';
  return `Lecture sucrée - ${title} - ${when}.${ext}`;
}

export type ShareResult = 'shared' | 'unavailable' | 'missing' | 'corrupted';

export async function shareSessionAudio(session: SessionSummary): Promise<ShareResult> {
  if (!session.audioPath) return 'missing';
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const src = finalFile(session.audioPath);
  if (!src.exists) return 'missing';

  const dir = new Directory(Paths.cache, APP_DIR, Dirs.exports);
  if (!dir.exists) dir.create({ intermediates: true });
  const copy = new File(dir, exportFileName(session.volumeTitle, session.startedAt));
  if (copy.exists) copy.delete(); // ancienne copie temporaire d'export (jamais l'original)
  await src.copy(copy);

  // La copie partagée doit être identique à l'original enregistré.
  if (session.audioSha256 && (await copy.digest('SHA-256')) !== session.audioSha256) {
    copy.delete();
    return 'corrupted';
  }
  await Sharing.shareAsync(copy.uri, { dialogTitle: 'Exporter l’audio de la session' });
  return 'shared';
}
