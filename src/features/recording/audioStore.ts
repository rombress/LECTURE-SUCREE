/**
 * Fichiers audio sur l'appareil (expo-file-system).
 *
 * expo-audio enregistre DIRECTEMENT dans le dossier Documents (persistant,
 * jamais purgé par iOS) sous `Documents/ExpoAudio/<sessionId>.m4a`
 * (option `directory: 'document'`, vérifiée dans le code Swift d'expo-audio 58).
 * À l'arrêt, le fichier est DÉPLACÉ (renommage sur le même volume) vers
 * `Documents/lecture-sucree/audio/<AAAA>/<sessionId>.m4a`, puis son SHA-256 est
 * calculé. Il n'est plus jamais modifié ensuite.
 */
import { Directory, File, Paths } from 'expo-file-system';

import { APP_DIR, audioRelativePath, isSafeRelativePath } from '@/data/files/paths';
import type { AudioAsset } from '@/domain/models';

export const AUDIO_EXT = 'm4a';
export const AUDIO_MIME = 'audio/mp4';
/** Sous-dossier imposé par expo-audio pour directory='document'. */
const RECORDER_DIR = 'ExpoAudio';

/** Opérations fichiers nécessaires à la finalisation/récupération (injectables en test). */
export interface AudioFileOps {
  /** Taille du fichier d'enregistrement en cours, ou null s'il n'existe pas. */
  recordingSize(sessionId: string): number | null;
  /** Taille du fichier final, ou null s'il n'existe pas. */
  finalSize(relPath: string): number | null;
  /** Déplace l'enregistrement vers son emplacement final (sans écraser). */
  moveRecordingToFinal(sessionId: string, relPath: string): Promise<void>;
  sha256(relPath: string): Promise<string>;
}

function appRoot(): Directory {
  return new Directory(Paths.document, APP_DIR);
}

export function recordingFile(sessionId: string): File {
  return new File(Paths.document, RECORDER_DIR, `${sessionId}.${AUDIO_EXT}`);
}

/** Fichier final à partir d'un chemin relatif stocké en base. */
export function finalFile(relPath: string): File {
  if (!isSafeRelativePath(relPath)) throw new Error('chemin audio invalide');
  return new File(appRoot(), ...relPath.split('/'));
}

export const deviceAudioOps: AudioFileOps = {
  recordingSize(sessionId) {
    const f = recordingFile(sessionId);
    return f.exists ? f.size : null;
  },
  finalSize(relPath) {
    const f = finalFile(relPath);
    return f.exists ? f.size : null;
  },
  async moveRecordingToFinal(sessionId, relPath) {
    const src = recordingFile(sessionId);
    const dst = finalFile(relPath);
    if (dst.exists) throw new Error('le fichier audio final existe déjà : aucun écrasement');
    const parent = dst.parentDirectory;
    if (!parent.exists) parent.create({ intermediates: true });
    await src.move(dst);
  },
  async sha256(relPath) {
    return finalFile(relPath).digest('SHA-256');
  },
};

/**
 * Met l'enregistrement d'une session à sa place définitive et décrit l'audio.
 * Idempotent : si le fichier a déjà été déplacé (plantage entre le
 * déplacement et l'écriture en base), il est simplement re-décrit.
 * Retourne null si aucun audio n'existe.
 */
export async function settleAudio(
  ops: AudioFileOps,
  sessionId: string,
  startedAtIso: string,
  durationMs: number,
): Promise<AudioAsset | null> {
  const rel = audioRelativePath(sessionId, startedAtIso, AUDIO_EXT);
  const pending = ops.recordingSize(sessionId);
  if (pending !== null && pending > 0) {
    await ops.moveRecordingToFinal(sessionId, rel);
  }
  const size = ops.finalSize(rel);
  if (size === null || size === 0) return null;
  return { path: rel, mimeType: AUDIO_MIME, bytes: size, sha256: await ops.sha256(rel), durationMs };
}
