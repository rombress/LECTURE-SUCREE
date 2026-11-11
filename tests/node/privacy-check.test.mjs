/**
 * Teste scripts/privacy-check.mjs dans des dépôts Git JETABLES (dossier
 * temporaire du système), jamais dans le dépôt réel.
 *
 * Les faux secrets sont assemblés à l'exécution (concaténation) pour que ce
 * fichier lui-même ne contienne aucun motif détectable.
 */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/privacy-check.mjs');
const created = [];

function sandbox({ email = '12345+pseudo@users.noreply.github.com' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ls-privacy-'));
  created.push(dir);
  const run = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', email);
  run('config', 'user.name', 'Testeur');
  run('config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(SCRIPT, join(dir, 'scripts', 'privacy-check.mjs'));
  const write = (rel, content) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
    run('add', '-f', rel);
  };
  const check = (...modes) => spawnSync(process.execPath, ['scripts/privacy-check.mjs', ...modes], { cwd: dir, encoding: 'utf8' });
  run('add', 'scripts/privacy-check.mjs');
  return { dir, run, write, check };
}

after(() => {
  for (const d of created) rmSync(d, { recursive: true, force: true });
});

test('accepte du code public propre', () => {
  const s = sandbox();
  s.write('src/a.ts', 'export const x = 1;\n');
  s.write('docs/X.md', '# Doc\nContact : auteur@example.com\n');
  const r = s.check('--staged');
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test('bloque une base SQLite, un audio, un .env, un keystore (par extension)', () => {
  for (const f of ['data/user.db', 'audio/note.m4a', '.env', 'release.jks', 'backups/b.lsbackup']) {
    const s = sandbox();
    s.write(f, 'contenu');
    const r = s.check('--staged');
    assert.equal(r.status, 1, `${f} aurait dû être bloqué`);
  }
});

test('bloque une base SQLite renommée en .ts (signature binaire)', () => {
  const s = sandbox();
  s.write('src/innocent.ts', Buffer.concat([Buffer.from('SQLite format 3\u0000'), Buffer.alloc(100)]));
  const r = s.check('--staged');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /SQLite/);
});

test('bloque des secrets dans le texte sans jamais les afficher', () => {
  const secrets = [
    'ya29' + '.' + 'A'.repeat(30),
    'GOCSPX' + '-' + 'b'.repeat(20),
    'ghp' + '_' + 'c'.repeat(36),
    '-----BEGIN ' + 'PRIVATE KEY-----',
    'abcd' + '-efgh' + '-ijkl' + '-mnop',
  ];
  for (const secret of secrets) {
    const s = sandbox();
    s.write('src/config.ts', `export const v = "${secret}";\n`);
    const r = s.check('--staged');
    assert.equal(r.status, 1, 'secret non détecté');
    assert.ok(!(r.stdout + r.stderr).includes(secret), 'la valeur secrète ne doit pas être affichée');
  }
});

test('bloque une adresse e-mail réelle mais pas les domaines d’exemple', () => {
  const s = sandbox();
  s.write('docs/A.md', 'écrire à ' + 'quelquun' + '@' + 'gmail.com\n');
  assert.equal(s.check('--staged').status, 1);
});

test('autorise un module Swift local mais bloque le projet ios/ généré à la racine', () => {
  const ok = sandbox();
  ok.write('modules/lecture-audio/ios/LectureAudioModule.swift', 'import ExpoModulesCore\n');
  ok.write('modules/lecture-audio/expo-module.config.json', '{"platforms":["apple"]}\n');
  const okRun = ok.check('--staged');
  assert.equal(okRun.status, 0, okRun.stderr);
  const ko = sandbox();
  ko.write('ios/Lecturesucree/AppDelegate.swift', 'import UIKit\n');
  const r = ko.check('--staged');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /projet natif généré/);
});

test('bloque un fichier hors liste blanche', () => {
  const s = sandbox();
  s.write('notes-perso.txt', 'rien de secret');
  const r = s.check('--staged');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /liste blanche/);
});

test('bloque un terme personnel listé dans .privacy-denylist (fichier local)', () => {
  const s = sandbox();
  writeFileSync(join(s.dir, '.privacy-denylist'), '# mes termes\nJeanne Fictive\n');
  s.write('docs/B.md', 'Projet de jeanne fictive\n');
  const r = s.check('--staged');
  assert.equal(r.status, 1);
  assert.ok(!r.stderr.toLowerCase().includes('jeanne'), 'le terme ne doit pas être affiché');
});

test('bloque le commit si l’e-mail Git n’est pas une adresse noreply', () => {
  const s = sandbox({ email: 'reel' + '@' + 'fournisseur.fr' });
  s.write('src/a.ts', 'export {};\n');
  const r = s.check('--staged');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /noreply/);
});

test('accepte l’adresse d’auteur fictive explicitement autorisée', () => {
  const s = sandbox({ email: 'xxx' + '@' + 'xxx.fr' });
  s.write('src/a.ts', 'export {};\n');
  const r = s.check('--staged');
  assert.equal(r.status, 0, r.stderr);
});

test('--tracked détecte un fichier interdit DÉJÀ suivi (que .gitignore ne protège pas)', () => {
  const s = sandbox();
  s.write('src/a.ts', 'export {};\n');
  s.run('commit', '-q', '-m', 'init', '--no-verify');
  s.write('notes.sqlite', 'x');
  s.run('commit', '-q', '-m', 'oups', '--no-verify');
  writeFileSync(join(s.dir, '.gitignore'), '*.sqlite\n');
  const r = s.check('--tracked');
  assert.equal(r.status, 1);
});

test('--history retrouve un secret supprimé dans un commit ultérieur', () => {
  const s = sandbox();
  s.write('src/a.ts', `export const k = "${'AKIA' + 'Z'.repeat(16)}";\n`);
  s.run('commit', '-q', '-m', 'ajout', '--no-verify');
  s.write('src/a.ts', 'export const k = "";\n');
  s.run('commit', '-q', '-m', 'retrait', '--no-verify');
  assert.equal(s.check('--tracked').status, 0, 'l’état courant est propre');
  const r = s.check('--history');
  assert.equal(r.status, 1, 'mais l’historique contient encore le secret');
});
