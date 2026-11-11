import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { patchSource } from '../../scripts/patch-speech-recognition.mjs';

const SWIFT = new URL('../../node_modules/expo-speech-recognition/ios/ExpoSpeechRecognizer.swift', import.meta.url);

test('correctif Swift : appliqué une seule fois, idempotent', () => {
  const sample = `x
      try audioSession.setCategory(
        options.category.avCategory,
        mode: options.mode.avMode,
        options: categoryOptions
      )
    } else {
y`;
  const once = patchSource(sample);
  assert.equal(once.changed, true);
  assert.match(once.src, /if audioSession\.category != options\.category\.avCategory/);
  assert.equal((once.src.match(/try audioSession\.setCategory\(/g) ?? []).length, 1);
  const twice = patchSource(once.src);
  assert.equal(twice.changed, false);
  assert.equal(twice.src, once.src);
});

test('correctif Swift : échoue bruyamment si le code attendu a changé', () => {
  assert.throws(() => patchSource('rien de reconnaissable'), /trouvé 0 fois/);
});

test('le module installé porte le correctif (postinstall exécuté)', () => {
  const src = readFileSync(SWIFT, 'utf8');
  assert.match(src, /lecture-sucree: setCategory seulement si nécessaire/);
  // setActive(true) reste appelé (sans effet si la session est déjà active) ;
  // le module ne désactive jamais la session (l'enregistreur continuerait).
  assert.doesNotMatch(src, /setActive\(false/);
});
