/**
 * Couvertures : import depuis Photos ou Fichiers, normalisation, stockage privé.
 *
 * - L'image choisie est redimensionnée (900 px de large max) et convertie en
 *   JPEG (HEIC/PNG acceptés) : affichage fluide, quelques centaines de Ko.
 * - Tant que la fiche n'est pas enregistrée, l'image reste dans le cache
 *   (« en attente ») ; à l'enregistrement, elle est COPIÉE dans
 *   Documents/lecture-sucree/covers/<id>-<horodatage>.jpg (persistant).
 * - L'image d'origine dans Photos/Fichiers n'est jamais modifiée.
 * - Aucune API externe : tout est local.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { APP_DIR, Dirs, coverRelativePath, isSafeRelativePath } from '@/data/files/paths';
import { log } from '@/services/log';

const MAX_WIDTH = 900;

/** Normalise une image choisie : JPEG ≤ 900 px de large. Retourne l'URI temporaire (cache). */
async function normalize(uri: string): Promise<string> {
  // `maxWidth` sous-échantillonne AU DÉCODAGE (ImageDownsampling.swift) : une
  // photo 48 MP n'est jamais chargée en pleine résolution (≈ 190 Mo évités).
  // Une image plus petite n'est jamais agrandie.
  const img = await ImageManipulator.manipulate(uri, { maxWidth: MAX_WIDTH }).renderAsync();
  const result = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return result.uri;
}

/**
 * Photos (sélecteur système). Pas de recadrage : sur iOS, `allowsEditing`
 * impose un carré (doc expo-image-picker 58), inadapté à une couverture.
 * L'image entière est conservée ; l'affichage la cadre en 2:3. null si annulé.
 */
export async function pickCoverFromPhotos(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  if (res.canceled || !res.assets[0]) return null;
  return normalize(res.assets[0].uri);
}

/** Fichiers (iCloud Drive, Google Drive via Fichiers…). null si annulé. */
export async function pickCoverFromFiles(): Promise<string | null> {
  const res = await File.pickFileAsync({ mimeTypes: ['image/*'] });
  if (res.canceled || !res.result) return null;
  return normalize(res.result.uri);
}

function coversRoot(): Directory {
  return new Directory(Paths.document, APP_DIR, Dirs.covers);
}

/** URI affichable d'une couverture stockée (chemin relatif en base). */
export function coverUri(relPath: string | null | undefined): string | null {
  if (!relPath || !isSafeRelativePath(relPath) || !relPath.startsWith(`${Dirs.covers}/`)) return null;
  const f = new File(Paths.document, APP_DIR, ...relPath.split('/'));
  return f.exists ? f.uri : null;
}

/** Copie une image en attente dans le stockage privé ; retourne le chemin relatif à enregistrer en base. */
export async function persistCover(pendingUri: string, ownerId: string): Promise<string> {
  const rel = coverRelativePath(`${ownerId}-${Date.now()}`, 'jpg');
  const dir = coversRoot();
  if (!dir.exists) dir.create({ intermediates: true });
  const dst = new File(Paths.document, APP_DIR, ...rel.split('/'));
  await new File(pendingUri).copy(dst);
  if (!dst.exists || dst.size === 0) throw new Error('copie de la couverture échouée');
  return rel;
}

/**
 * Supprime une ANCIENNE couverture après son remplacement (copie interne
 * à l'app, jamais l'image d'origine de l'utilisateur). Erreur ignorée :
 * au pire, un petit fichier orphelin reste.
 */
export function discardCover(relPath: string | null | undefined): void {
  if (!relPath || !isSafeRelativePath(relPath) || !relPath.startsWith(`${Dirs.covers}/`)) return;
  try {
    const f = new File(Paths.document, APP_DIR, ...relPath.split('/'));
    if (f.exists) f.delete();
  } catch {
    log.warn('cover.discard_failed');
  }
}

/** État d'édition d'une couverture dans un formulaire. */
export type CoverDraft =
  | { kind: 'keep' } // inchangée
  | { kind: 'new'; pendingUri: string } // nouvelle image choisie (cache)
  | { kind: 'remove' }; // retour à la couverture typographique

/**
 * Applique un brouillon de couverture lors de l'enregistrement d'une fiche.
 * Retourne le chemin à enregistrer (undefined = inchangé) et l'ancien
 * chemin à supprimer APRÈS l'écriture réussie en base.
 */
export async function resolveCoverDraft(
  draft: CoverDraft,
  ownerId: string,
  currentPath: string | null,
): Promise<{ coverPath: string | null | undefined; discard: string | null }> {
  if (draft.kind === 'keep') return { coverPath: undefined, discard: null };
  if (draft.kind === 'remove') return { coverPath: null, discard: currentPath };
  return { coverPath: await persistCover(draft.pendingUri, ownerId), discard: currentPath };
}
