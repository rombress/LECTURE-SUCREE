/** Implémentation de la corbeille sur l'appareil (expo-file-system). */
import { Directory, File, Paths } from 'expo-file-system';

import { APP_DIR, isSafeRelativePath } from '@/data/files/paths';
import { finalFile } from '@/features/recording/audioStore';

import type { TrashOps } from './deletion';

const TRASH = 'trash';

function trashDir(): Directory {
  return new Directory(Paths.document, APP_DIR, TRASH);
}

function trashFileFor(audioRel: string): File {
  if (!isSafeRelativePath(audioRel)) throw new Error('chemin audio invalide');
  const name = audioRel.split('/').pop()!;
  return new File(trashDir(), name);
}

function safeName(name: string): string {
  if (!/^[A-Za-z0-9-]{1,64}\.[a-z0-9]{1,5}$/.test(name)) throw new Error('nom de corbeille invalide');
  return name;
}

async function moveBack(src: File, audioRel: string) {
  const dst = finalFile(audioRel);
  if (dst.exists) throw new Error('un fichier existe déjà à l’emplacement d’origine');
  const parent = dst.parentDirectory;
  if (!parent.exists) parent.create({ intermediates: true });
  await src.move(dst);
}

export const deviceTrashOps: TrashOps = {
  async moveToTrash(audioRel) {
    const src = finalFile(audioRel);
    if (!src.exists) return false;
    const dir = trashDir();
    if (!dir.exists) dir.create({ intermediates: true });
    const dst = trashFileFor(audioRel);
    if (dst.exists) dst.delete(); // reste d'une suppression précédente du même fichier
    await src.move(dst);
    return true;
  },
  async restoreFromTrash(audioRel) {
    const src = trashFileFor(audioRel);
    if (src.exists) await moveBack(src, audioRel);
  },
  async purgeFromTrash(audioRel) {
    const f = trashFileFor(audioRel);
    if (f.exists) f.delete();
  },
  listTrash() {
    const dir = trashDir();
    if (!dir.exists) return [];
    return dir
      .list()
      .filter((e): e is File => e instanceof File)
      .map((f) => f.name);
  },
  purgeTrashName(name) {
    const f = new File(trashDir(), safeName(name));
    if (f.exists) f.delete();
  },
  async restoreTrashName(name, audioRel) {
    const f = new File(trashDir(), safeName(name));
    if (f.exists) await moveBack(f, audioRel);
  },
};
