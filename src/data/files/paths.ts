/**
 * Organisation des fichiers privés de l'application.
 *
 * Tous les chemins enregistrés en base sont RELATIFS à la racine privée :
 * l'URI absolue du bac à sable iOS change à chaque réinstallation et ne doit
 * donc jamais être stockée.
 *
 *   <document>/lecture-sucree/
 *     audio/<AAAA>/<sessionId>.<ext>   audio original (jamais modifié)
 *     covers/<id>.<ext>                couvertures choisies par l'utilisateur
 *     backups/                         sauvegardes locales (lot Sauvegardes)
 *   <cache>/lecture-sucree/exports/    exports temporaires (DOCX/TXT/JSON),
 *                                      partagés puis supprimables par le système
 */

export const APP_DIR = 'lecture-sucree';

export const Dirs = {
  audio: 'audio',
  covers: 'covers',
  backups: 'backups',
  exports: 'exports',
} as const;

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
const SAFE_EXT = /^[a-z0-9]{1,5}$/;

/** Chemin relatif de l'audio d'une session. Refuse tout identifiant non sûr (anti « ../ »). */
export function audioRelativePath(sessionId: string, startedAtIso: string, ext: string): string {
  if (!SAFE_ID.test(sessionId)) throw new Error('identifiant de session invalide');
  if (!SAFE_EXT.test(ext)) throw new Error('extension invalide');
  const year = /^(\d{4})-/.exec(startedAtIso)?.[1];
  if (!year) throw new Error('date invalide');
  return `${Dirs.audio}/${year}/${sessionId}.${ext}`;
}

export function coverRelativePath(id: string, ext: string): string {
  if (!SAFE_ID.test(id)) throw new Error('identifiant invalide');
  if (!SAFE_EXT.test(ext)) throw new Error('extension invalide');
  return `${Dirs.covers}/${id}.${ext}`;
}

/** Vérifie qu'un chemin relatif reste dans la racine privée. */
export function isSafeRelativePath(p: string): boolean {
  if (!p || p.startsWith('/') || p.includes('\\') || /^[a-z]+:/i.test(p)) return false;
  return p.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}
