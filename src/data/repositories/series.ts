import type { Id, Series } from '@/domain/models';
import { validateSeries, type SeriesInput } from '@/domain/validation';

import type { DbLike } from '../db/types';

import { ValidationError } from './volumes';

interface SeriesRow {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeriesWithStats extends Series {
  volumeCount: number;
  readingCount: number;
  finishedCount: number;
  /** Couverture de la série, sinon celle de son premier tome illustré. */
  displayCoverPath: string | null;
  /** Dernière activité : session la plus récente ou modification. */
  activityAt: string;
}

export interface SeriesFormInput extends SeriesInput {
  coverPath?: string | null;
}

function toSeries(r: SeriesRow): Series {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    description: r.description,
    coverPath: r.cover_path,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const clean = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t.length ? t : null;
};

function normalize(input: SeriesFormInput) {
  const v = validateSeries(input);
  if (!v.ok) throw new ValidationError(v.errors);
  return { title: input.title.trim(), author: clean(input.author), description: clean(input.description), coverPath: input.coverPath ?? null };
}

export async function listSeries(db: DbLike): Promise<SeriesWithStats[]> {
  const rows = await db.getAllAsync<
    SeriesRow & { volume_count: number; reading_count: number; finished_count: number; first_cover: string | null; activity_at: string }
  >(
    `SELECT s.*,
            (SELECT count(*) FROM volumes v WHERE v.series_id = s.id) AS volume_count,
            (SELECT count(*) FROM volumes v WHERE v.series_id = s.id AND v.status = 'reading') AS reading_count,
            (SELECT count(*) FROM volumes v WHERE v.series_id = s.id AND v.status = 'finished') AS finished_count,
            (SELECT v.cover_path FROM volumes v WHERE v.series_id = s.id AND v.cover_path IS NOT NULL
              ORDER BY v.sort_index IS NULL, v.sort_index, v.created_at LIMIT 1) AS first_cover,
            max(s.updated_at,
                coalesce((SELECT max(v.updated_at) FROM volumes v WHERE v.series_id = s.id), ''),
                coalesce((SELECT max(rs.started_at) FROM reading_sessions rs JOIN volumes v ON v.id = rs.volume_id
                           WHERE v.series_id = s.id), '')) AS activity_at
       FROM series s
      ORDER BY activity_at DESC, s.title COLLATE NOCASE`,
    [],
  );
  return rows.map((r) => ({
    ...toSeries(r),
    volumeCount: r.volume_count,
    readingCount: r.reading_count,
    finishedCount: r.finished_count,
    displayCoverPath: r.cover_path ?? r.first_cover,
    activityAt: r.activity_at,
  }));
}

export async function getSeries(db: DbLike, id: Id): Promise<Series | null> {
  const r = await db.getFirstAsync<SeriesRow>('SELECT * FROM series WHERE id = ?', [id]);
  return r ? toSeries(r) : null;
}

export async function createSeries(db: DbLike, id: Id, input: SeriesFormInput, nowIso: string): Promise<Series> {
  const n = normalize(input);
  await db.runAsync(
    'INSERT INTO series (id, title, author, description, cover_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, n.title, n.author, n.description, n.coverPath, nowIso, nowIso],
  );
  const s = await getSeries(db, id);
  if (!s) throw new Error('Série introuvable après création');
  return s;
}

export async function updateSeries(db: DbLike, id: Id, input: SeriesFormInput, nowIso: string): Promise<Series> {
  const n = normalize(input);
  const res = await db.runAsync(
    'UPDATE series SET title = ?, author = ?, description = ?, cover_path = ?, updated_at = ? WHERE id = ?',
    [n.title, n.author, n.description, n.coverPath, nowIso, id],
  );
  if (res.changes !== 1) throw new Error('Série introuvable');
  const s = await getSeries(db, id);
  if (!s) throw new Error('Série introuvable');
  return s;
}

/**
 * Retire une série. Ses tomes deviennent INDÉPENDANTS (clé étrangère
 * ON DELETE SET NULL) : aucun tome, aucune session, aucun audio n'est supprimé.
 * Retourne le nombre de tomes rendus indépendants.
 */
export async function removeSeries(db: DbLike, id: Id, nowIso: string): Promise<number> {
  if (!(await getSeries(db, id))) throw new Error('Série introuvable');
  // Détachement EXPLICITE d'abord (ne dépend pas de PRAGMA foreign_keys).
  // En cas d'interruption entre les deux requêtes, il reste une série vide :
  // aucune perte.
  const detached = await db.runAsync('UPDATE volumes SET series_id = NULL, updated_at = ? WHERE series_id = ?', [nowIso, id]);
  await db.runAsync('DELETE FROM series WHERE id = ?', [id]);
  return detached.changes;
}
