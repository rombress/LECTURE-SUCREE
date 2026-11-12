/**
 * Migrations RÉELLES (src/data/db/migrate.ts + migrations.ts) exécutées sur
 * node:sqlite, avec un exécuteur qui reproduit celui de l'app
 * (src/data/db/database.ts) : BEGIN / COMMIT, ROLLBACK en cas d'erreur,
 * user_version écrit DANS la même transaction.
 *
 * Données entièrement fictives. Limite : la version de SQLite de Node peut
 * différer de celle embarquée par expo-sqlite sur l'iPhone (test J1).
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { migrate, MigrationError } from '../../src/data/db/migrate.ts';
import { MIGRATIONS } from '../../src/data/db/migrations.ts';

const NOW = '2026-01-01T10:00:00.000Z';

/** Exécuteur équivalent à executorFor() de l'app (withExclusiveTransactionAsync). */
function executor(db) {
  return {
    async getUserVersion() {
      return db.prepare('PRAGMA user_version').get().user_version;
    },
    async setUserVersion(v) {
      db.exec(`PRAGMA user_version = ${v}`);
    },
    async transaction(fn) {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql) {
      db.exec(sql);
    },
  };
}

function openDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

/** Bibliothèque fictive complète : séries, tomes, couvertures, sessions, audio, transcriptions, segments, catégories, réglages. */
function seed(db) {
  const ins = (sql, ...args) => db.prepare(sql).run(...args);
  ins('INSERT INTO series (id,title,author,cover_path,created_at,updated_at) VALUES (?,?,?,?,?,?)', 's1', 'Saga fictive', 'Auteur Fictif', 'covers/s1.jpg', NOW, NOW);
  ins('INSERT INTO series (id,title,created_at,updated_at) VALUES (?,?,?,?)', 's2', 'Autre saga fictive', NOW, NOW);
  for (let i = 1; i <= 5; i++) {
    ins(
      `INSERT INTO volumes (id,series_id,title,author,volume_label,sort_index,page_count,current_page,status,description,cover_path,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      `v${i}`, i <= 3 ? 's1' : null, `Tome fictif ${i}`, 'Auteur Fictif', String(i), i, 300 + i, i * 10, i === 1 ? 'reading' : 'to_read', 'Résumé fictif', `covers/v${i}.jpg`, NOW, NOW,
    );
  }
  for (let i = 1; i <= 4; i++) {
    ins(
      `INSERT INTO reading_sessions (id,volume_id,started_at,ended_at,utc_offset,duration_ms,page,state,audio_path,audio_mime,audio_bytes,audio_sha256,audio_duration_ms,
                                     transcript_raw,transcript_text,transcript_status,transcription_engine,locale,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      `sess${i}`, `v${(i % 3) + 1}`, NOW, NOW, '+01:00', 60000 * i, 12, 'completed', `audio/2026/sess${i}.m4a`, 'audio/mp4', 1000 * i, `sha${i}`, 60000 * i,
      `texte brut fictif ${i}`, `Texte corrigé fictif ${i}, théorie`, 'complete', 'ios-speech-ondevice', 'fr-FR', NOW, NOW,
    );
    ins('INSERT INTO transcript_segments (session_id,seq,text,is_final,offset_ms,created_at) VALUES (?,?,?,?,?,?)', `sess${i}`, 1, `segment fictif ${i}`, 1, 0, NOW);
    ins('INSERT INTO session_categories (session_id,category_id) VALUES (?,?)', `sess${i}`, 'theories');
  }
  ins('INSERT INTO app_settings (key,value) VALUES (?,?)', 'transcription.prefs', '{"live":true,"allowNetwork":false}');
}

const TABLES = ['series', 'volumes', 'reading_sessions', 'transcript_segments', 'categories', 'session_categories', 'app_settings'];
function snapshot(db) {
  const out = {};
  for (const t of TABLES) out[t] = db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all().map((r) => ({ ...r }));
  out.fts = db.prepare("SELECT session_id FROM sessions_fts WHERE sessions_fts MATCH 'theorie' ORDER BY session_id").all().map((r) => r.session_id);
  return out;
}

/** Les données d'avant doivent être identiques ; seules les NOUVELLES colonnes (toutes NULL) s'ajoutent. */
function assertPreserved(before, after) {
  for (const t of Object.keys(before)) {
    if (t === 'fts') {
      assert.deepEqual(after.fts, before.fts, 'index plein texte modifié');
      continue;
    }
    assert.equal(after[t].length, before[t].length, `nombre de lignes de ${t} modifié`);
    after[t].forEach((row, i) => {
      for (const [k, v] of Object.entries(before[t][i])) assert.deepEqual(row[k], v, `${t}.${k} modifié`);
      for (const k of Object.keys(row)) if (!(k in before[t][i])) assert.equal(row[k], null, `nouvelle colonne ${t}.${k} non vide`);
    });
  }
}

function assertHealthy(db) {
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
}

async function dbAt(version) {
  const db = openDb();
  await migrate(executor(db), MIGRATIONS.slice(0, version));
  return db;
}

test('base neuve → dernière version : schéma complet et sain', async () => {
  const db = openDb();
  const r = await migrate(executor(db), MIGRATIONS);
  assert.deepEqual(r, { from: 0, to: MIGRATIONS.length, applied: MIGRATIONS.map((m) => m.version) });
  const cols = db.prepare('PRAGMA table_info(volumes)').all().map((c) => c.name);
  for (const c of ['isbn', 'publisher', 'language', 'source_ref', 'cover_credit']) assert.ok(cols.includes(c), c);
  assertHealthy(db);
});

test('vraie bibliothèque v1 → v3 directement : toutes les données identiques, base saine', async () => {
  const db = await dbAt(1);
  seed(db);
  const before = snapshot(db);
  const r = await migrate(executor(db), MIGRATIONS);
  assert.deepEqual(r.applied, [2, 3]);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  assertPreserved(before, snapshot(db));
  assertHealthy(db);
});

test('v2 → v3 : données (y compris ISBN, éditeur, langue) identiques', async () => {
  const db = await dbAt(2);
  seed(db);
  db.prepare("UPDATE volumes SET isbn = '9780306406157', publisher = 'Éditions Fictives', language = 'fre', source_ref = 'bnf:ark:/12148/cbTEST' WHERE id = 'v1'").run();
  const before = snapshot(db);
  const r = await migrate(executor(db), MIGRATIONS);
  assert.deepEqual(r.applied, [3]);
  assertPreserved(before, snapshot(db));
  assertHealthy(db);
});

test('déjà à jour : aucune migration rejouée', async () => {
  const db = await dbAt(MIGRATIONS.length);
  seed(db);
  const before = snapshot(db);
  assert.deepEqual((await migrate(executor(db), MIGRATIONS)).applied, []);
  assert.deepEqual(snapshot(db), before);
});

test('erreur simulée au MILIEU d’une migration : tout est annulé, user_version inchangé, données intactes', async () => {
  const db = await dbAt(2);
  seed(db);
  const before = snapshot(db);
  const broken = [
    ...MIGRATIONS.slice(0, 2),
    // La 1re instruction réussit (ADD COLUMN), la 2e échoue : la 1re doit être annulée.
    { version: 3, name: 'cassée', sql: 'ALTER TABLE volumes ADD COLUMN cover_credit TEXT; INSERT INTO table_inexistante VALUES (1);' },
  ];
  await assert.rejects(() => migrate(executor(db), broken), (e) => e instanceof MigrationError && e.version === 3);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2, 'user_version avancé malgré l’échec');
  const cols = db.prepare('PRAGMA table_info(volumes)').all().map((c) => c.name);
  assert.ok(!cols.includes('cover_credit'), 'colonne ajoutée malgré l’échec');
  assert.deepEqual(snapshot(db), before);
  assertHealthy(db);
  // Relance avec la vraie migration : elle passe.
  assert.deepEqual((await migrate(executor(db), MIGRATIONS)).applied, [3]);
});

test('échec en v1 → v3 : v2 conservée si elle a réussi, v3 annulée seule', async () => {
  const db = await dbAt(1);
  seed(db);
  const broken = [...MIGRATIONS.slice(0, 2), { version: 3, name: 'cassée', sql: 'SELECT * FROM table_inexistante;' }];
  await assert.rejects(() => migrate(executor(db), broken), MigrationError);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assertHealthy(db);
});

test('base créée par une version plus récente de l’app : refusée, rien n’est modifié', async () => {
  const db = await dbAt(MIGRATIONS.length);
  seed(db);
  db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
  const before = snapshot(db);
  await assert.rejects(() => migrate(executor(db), MIGRATIONS), /plus récente/);
  assert.deepEqual(snapshot(db), before);
});

test('aucun code de l’app ne supprime ni ne remplace la base (même après un échec de migration)', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) {
        if (f !== '__tests__' && f !== '__testutils__') walk(p);
      } else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk('src');
  const offenders = files.filter((p) => /deleteDatabase(Sync|Async)?\s*\(|DATABASE_NAME[^;]*\.delete\(|\.db['"`]\s*\)\.delete\(/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(offenders, []);
});
