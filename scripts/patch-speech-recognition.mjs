#!/usr/bin/env node
/**
 * Correctif local d'expo-speech-recognition (Swift), appliqué après chaque
 * `npm install` / `npm ci` (script postinstall), donc aussi sur GitHub Actions.
 *
 * Problème (lu dans ExpoSpeechRecognizer.swift, version 58.0.1) : à CHAQUE
 * démarrage d'une tâche de reconnaissance, le module appelle
 * `AVAudioSession.setCategory(...)`, même si la session est déjà configurée
 * à l'identique par l'enregistreur expo-audio. Or la transcription relance
 * régulièrement des tâches pendant un enregistrement.
 *
 * Correctif : `setCategory` n'est appelé que si la catégorie, le mode ou les
 * options DIFFÈRENT de l'état actuel. Si la comparaison échoue (option
 * ajoutée par iOS, etc.), le comportement d'origine est conservé : le
 * correctif ne peut pas faire pire que l'existant.
 *
 * Sécurité : le script échoue bruyamment si le code attendu n'est pas trouvé
 * (nouvelle version du module) ; il est idempotent.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = '// lecture-sucree: setCategory seulement si nécessaire';

const ORIGINAL = `      try audioSession.setCategory(
        options.category.avCategory,
        mode: options.mode.avMode,
        options: categoryOptions
      )
    } else {`;

const PATCHED = `      ${MARKER}
      if audioSession.category != options.category.avCategory
        || audioSession.mode != options.mode.avMode
        || audioSession.categoryOptions != categoryOptions
      {
        try audioSession.setCategory(
          options.category.avCategory,
          mode: options.mode.avMode,
          options: categoryOptions
        )
      }
    } else {`;

export function patchSource(src) {
  if (src.includes(MARKER)) return { changed: false, src };
  const count = src.split(ORIGINAL).length - 1;
  if (count !== 1) {
    throw new Error(`expo-speech-recognition : code attendu trouvé ${count} fois (1 attendu). Vérifier la version du module et ce correctif.`);
  }
  return { changed: true, src: src.replace(ORIGINAL, PATCHED) };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const file = join(root, 'node_modules', 'expo-speech-recognition', 'ios', 'ExpoSpeechRecognizer.swift');
  if (!existsSync(file)) {
    throw new Error(`expo-speech-recognition introuvable : ${file}`);
  }
  const { changed, src } = patchSource(readFileSync(file, 'utf8'));
  if (changed) writeFileSync(file, src);
  process.stdout.write(`[patch-speech-recognition] ${changed ? 'appliqué' : 'déjà appliqué'}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
