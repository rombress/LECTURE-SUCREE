#!/usr/bin/env node
// Active les hooks Git versionnés dans .githooks/ (pre-commit, pre-push).
// Appelé automatiquement par `npm install` (script "prepare").
// Sans effet hors d'un dépôt Git (ex. archive) et en CI.
import { execFileSync } from 'node:child_process';
import { existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

if (process.env.CI) {
  console.log('[hooks] CI détectée : installation des hooks ignorée.');
  process.exit(0);
}

let root;
try {
  root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
} catch {
  console.log('[hooks] Pas de dépôt Git : hooks non installés.');
  process.exit(0);
}

const hooksDir = join(root, '.githooks');
if (!existsSync(hooksDir)) {
  console.error('[hooks] Dossier .githooks/ introuvable.');
  process.exit(1);
}

for (const hook of ['pre-commit', 'pre-push']) {
  const p = join(hooksDir, hook);
  if (existsSync(p)) {
    try {
      chmodSync(p, 0o755);
    } catch {
      /* Windows : sans effet, Git for Windows exécute les hooks via sh */
    }
  }
}

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root });
console.log('[hooks] core.hooksPath = .githooks (pre-commit + pre-push actifs).');
