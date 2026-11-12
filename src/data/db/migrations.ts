/**
 * Migrations SQLite de Lecture sucrée.
 *
 * Règles :
 * - Une migration publiée n'est JAMAIS modifiée : on en ajoute une nouvelle.
 * - La version courante est stockée dans PRAGMA user_version.
 * - Chaque migration est appliquée dans une transaction (tout ou rien).
 * - Ce fichier n'importe rien : il est aussi exécuté tel quel par Node
 *   (tests/node/schema.test.mjs) pour tester le schéma réel sous Windows.
 */

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const V1 = `
CREATE TABLE series (
  id           TEXT PRIMARY KEY NOT NULL,
  title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
  author       TEXT,
  description  TEXT,
  cover_path   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE volumes (
  id            TEXT PRIMARY KEY NOT NULL,
  -- Retirer une série ne supprime JAMAIS ses tomes : ils deviennent indépendants.
  series_id     TEXT REFERENCES series(id) ON DELETE SET NULL,
  title         TEXT NOT NULL CHECK (length(trim(title)) > 0),
  author        TEXT NOT NULL CHECK (length(trim(author)) > 0),
  volume_label  TEXT,
  sort_index    REAL,
  page_count    INTEGER CHECK (page_count IS NULL OR page_count > 0),
  current_page  INTEGER NOT NULL DEFAULT 0 CHECK (current_page >= 0),
  status        TEXT NOT NULL DEFAULT 'to_read'
                CHECK (status IN ('to_read','reading','finished','paused','abandoned')),
  description   TEXT,
  cover_path    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_volumes_series ON volumes(series_id, sort_index);
CREATE INDEX idx_volumes_author ON volumes(author COLLATE NOCASE);

CREATE TABLE reading_sessions (
  id                    TEXT PRIMARY KEY NOT NULL,
  -- RESTRICT : impossible d'effacer un tome qui a des sessions par accident.
  -- La suppression d'un tome et de ses sessions sera une action explicite,
  -- confirmée, qui supprime d'abord les sessions (et leurs fichiers audio).
  volume_id             TEXT NOT NULL REFERENCES volumes(id) ON DELETE RESTRICT,
  started_at            TEXT NOT NULL,
  ended_at              TEXT,
  utc_offset            TEXT NOT NULL,
  duration_ms           INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  page                  INTEGER CHECK (page IS NULL OR page >= 0),
  state                 TEXT NOT NULL DEFAULT 'recording'
                        CHECK (state IN ('recording','paused','completed','interrupted')),
  audio_path            TEXT,
  audio_mime            TEXT,
  audio_bytes           INTEGER,
  audio_sha256          TEXT,
  audio_duration_ms     INTEGER,
  transcript_raw        TEXT NOT NULL DEFAULT '',
  transcript_text       TEXT NOT NULL DEFAULT '',
  transcript_status     TEXT NOT NULL DEFAULT 'none'
                        CHECK (transcript_status IN ('none','partial','complete','failed')),
  transcription_engine  TEXT,
  locale                TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX idx_sessions_volume_date ON reading_sessions(volume_id, started_at);
CREATE INDEX idx_sessions_date ON reading_sessions(started_at);

-- Segments de transcription : écriture en AJOUT seul pendant l'enregistrement,
-- pour sauvegarder la transcription partielle régulièrement sans réécrire
-- tout le texte (résistance aux crashs / interruptions).
CREATE TABLE transcript_segments (
  session_id   TEXT NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  text         TEXT NOT NULL,
  is_final     INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0,1)),
  offset_ms    INTEGER,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE categories (
  id     TEXT PRIMARY KEY NOT NULL,
  label  TEXT NOT NULL,
  sort   INTEGER NOT NULL
);
INSERT INTO categories (id, label, sort) VALUES
  ('characters','Personnages',1), ('theories','Théories',2), ('plot','Intrigue',3),
  ('symbolism','Symbolisme',4), ('feelings','Ressenti',5), ('quotes','Citations',6),
  ('predictions','Prédictions',7), ('inconsistencies','Incohérences',8),
  ('world','Univers',9), ('relationships','Relations',10), ('writing','Écriture',11);

CREATE TABLE session_categories (
  session_id   TEXT NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE,
  category_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  PRIMARY KEY (session_id, category_id)
);
CREATE INDEX idx_session_categories_cat ON session_categories(category_id);

CREATE TABLE app_settings (
  key    TEXT PRIMARY KEY NOT NULL,
  value  TEXT NOT NULL
);

-- Recherche plein texte (Archives). Table FTS5 autonome indexée par
-- session_id (pas de rowid externe : les rowid d'une table à clé TEXT peuvent
-- changer après VACUUM). Accents ignorés : « theorie » trouve « Théorie ».
CREATE VIRTUAL TABLE sessions_fts USING fts5(
  session_id UNINDEXED,
  transcript,
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER trg_sessions_fts_insert AFTER INSERT ON reading_sessions BEGIN
  INSERT INTO sessions_fts (session_id, transcript) VALUES (new.id, new.transcript_text);
END;
CREATE TRIGGER trg_sessions_fts_update AFTER UPDATE OF transcript_text ON reading_sessions BEGIN
  DELETE FROM sessions_fts WHERE session_id = old.id;
  INSERT INTO sessions_fts (session_id, transcript) VALUES (new.id, new.transcript_text);
END;
CREATE TRIGGER trg_sessions_fts_delete AFTER DELETE ON reading_sessions BEGIN
  DELETE FROM sessions_fts WHERE session_id = old.id;
END;
`;

/**
 * V2 — Importation de livres depuis les catalogues (BnF, Open Library).
 * AJOUT de colonnes facultatives uniquement (ALTER TABLE … ADD COLUMN) :
 * aucune ligne existante n'est réécrite, les livres déjà présents gardent
 * NULL. `source_ref` garde la notice d'origine (ex. « bnf:ark:/12148/… »).
 */
const V2 = `
ALTER TABLE volumes ADD COLUMN isbn TEXT CHECK (isbn IS NULL OR length(isbn) = 13);
ALTER TABLE volumes ADD COLUMN publisher TEXT;
ALTER TABLE volumes ADD COLUMN language TEXT;
ALTER TABLE volumes ADD COLUMN source_ref TEXT;
CREATE INDEX idx_volumes_isbn ON volumes(isbn) WHERE isbn IS NOT NULL;
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'schema initial V1', sql: V1 },
  { version: 2, name: 'métadonnées d’édition (ISBN, éditeur, langue, notice)', sql: V2 },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
