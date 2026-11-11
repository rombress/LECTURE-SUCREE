/**
 * Teste le VRAI schéma SQL (src/data/db/migrations.ts) avec le moteur SQLite
 * intégré à Node 24 (node:sqlite), sous Windows, sans appareil.
 * Données entièrement fictives.
 *
 * Limite : la version de SQLite de Node peut différer de celle embarquée par
 * expo-sqlite. La vérification sur appareil est faite par l'écran
 * « Diagnostic technique ».
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { MIGRATIONS } from '../../src/data/db/migrations.ts';

const NOW = '2026-01-01T10:00:00.000Z';

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) {
    db.exec('BEGIN');
    db.exec(m.sql);
    db.exec(`PRAGMA user_version = ${m.version}`);
    db.exec('COMMIT');
  }
  return db;
}

function addSeries(db, id) {
  db.prepare('INSERT INTO series (id,title,created_at,updated_at) VALUES (?,?,?,?)').run(id, 'Saga fictive', NOW, NOW);
}
function addVolume(db, id, seriesId = null) {
  db.prepare('INSERT INTO volumes (id,series_id,title,author,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(
    id,
    seriesId,
    'Tome fictif',
    'Auteur Fictif',
    NOW,
    NOW,
  );
}
function addSession(db, id, volumeId, text = '') {
  db.prepare(
    'INSERT INTO reading_sessions (id,volume_id,started_at,utc_offset,transcript_text,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
  ).run(id, volumeId, NOW, '+01:00', text, NOW, NOW);
}

test('le schéma s’applique et atteint la dernière version', () => {
  const db = freshDb();
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length);
  assert.equal(db.prepare('SELECT count(*) n FROM categories').get().n, 11);
});

test('retirer une série NE supprime NI ses tomes NI leurs sessions', () => {
  const db = freshDb();
  addSeries(db, 's1');
  addVolume(db, 'v1', 's1');
  addSession(db, 'sess1', 'v1', 'note fictive');
  db.prepare('DELETE FROM series WHERE id = ?').run('s1');
  const v = db.prepare('SELECT series_id FROM volumes WHERE id = ?').get('v1');
  assert.equal(v.series_id, null, 'le tome devient indépendant');
  assert.equal(db.prepare('SELECT count(*) n FROM reading_sessions').get().n, 1, 'la session subsiste');
});

test('un tome avec des sessions ne peut pas être supprimé par accident', () => {
  const db = freshDb();
  addVolume(db, 'v1');
  addSession(db, 'sess1', 'v1');
  assert.throws(() => db.prepare('DELETE FROM volumes WHERE id = ?').run('v1'), /FOREIGN KEY/);
});

test('une session exige un tome existant', () => {
  const db = freshDb();
  assert.throws(() => addSession(db, 'sess1', 'inexistant'), /FOREIGN KEY/);
});

test('titre et auteur obligatoires, statuts et pages contrôlés', () => {
  const db = freshDb();
  const ins = db.prepare('INSERT INTO volumes (id,title,author,status,page_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
  assert.throws(() => ins.run('a', '  ', 'X', 'to_read', null, NOW, NOW), /CHECK/);
  assert.throws(() => ins.run('b', 'T', '', 'to_read', null, NOW, NOW), /CHECK/);
  assert.throws(() => ins.run('c', 'T', 'X', 'lu', null, NOW, NOW), /CHECK/);
  assert.throws(() => ins.run('d', 'T', 'X', 'to_read', 0, NOW, NOW), /CHECK/);
  ins.run('e', 'T', 'X', 'abandoned', 320, NOW, NOW);
});

test('recherche plein texte : sans accents, mise à jour et suppression synchronisées', () => {
  const db = freshDb();
  addVolume(db, 'v1');
  addSession(db, 's1', 'v1', 'Une théorie élégante sur le narrateur');
  const search = (q) =>
    db.prepare('SELECT session_id FROM sessions_fts WHERE sessions_fts MATCH ?').all(q).map((r) => r.session_id);
  assert.deepEqual(search('theorie'), ['s1']);
  db.prepare('UPDATE reading_sessions SET transcript_text = ? WHERE id = ?').run('Prédiction audacieuse', 's1');
  assert.deepEqual(search('theorie'), []);
  assert.deepEqual(search('prediction'), ['s1']);
  db.prepare('DELETE FROM reading_sessions WHERE id = ?').run('s1');
  assert.deepEqual(search('prediction'), []);
});

test('catégories multiples ; supprimer une session supprime ses liens et segments', () => {
  const db = freshDb();
  addVolume(db, 'v1');
  addSession(db, 's1', 'v1');
  const link = db.prepare('INSERT INTO session_categories (session_id, category_id) VALUES (?,?)');
  link.run('s1', 'theories');
  link.run('s1', 'quotes');
  assert.throws(() => link.run('s1', 'inconnue'), /FOREIGN KEY/);
  db.prepare('INSERT INTO transcript_segments (session_id,seq,text,created_at) VALUES (?,?,?,?)').run('s1', 1, 'fictif', NOW);
  db.prepare('DELETE FROM reading_sessions WHERE id = ?').run('s1');
  assert.equal(db.prepare('SELECT count(*) n FROM session_categories').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) n FROM transcript_segments').get().n, 0);
});

test('tri chronologique des sessions d’un tome (base des exports)', () => {
  const db = freshDb();
  addVolume(db, 'v1');
  const ins = db.prepare(
    'INSERT INTO reading_sessions (id,volume_id,started_at,utc_offset,created_at,updated_at) VALUES (?,?,?,?,?,?)',
  );
  ins.run('b', 'v1', '2026-03-02T09:00:00.000Z', '+01:00', NOW, NOW);
  ins.run('a', 'v1', '2026-01-15T20:00:00.000Z', '+01:00', NOW, NOW);
  ins.run('c', 'v1', '2026-03-02T21:30:00.000Z', '+01:00', NOW, NOW);
  const ids = db
    .prepare('SELECT id FROM reading_sessions WHERE volume_id = ? ORDER BY started_at ASC')
    .all('v1')
    .map((r) => r.id);
  assert.deepEqual(ids, ['a', 'b', 'c']);
});
