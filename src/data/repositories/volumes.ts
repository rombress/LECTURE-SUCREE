import type { Id, Volume, VolumeStatus } from '@/domain/models';
import { validateVolume, type VolumeInput } from '@/domain/validation';

import type { DbLike } from '../db/types';

interface VolumeRow {
  id: string;
  series_id: string | null;
  title: string;
  author: string;
  volume_label: string | null;
  sort_index: number | null;
  page_count: number | null;
  current_page: number;
  status: VolumeStatus;
  description: string | null;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface VolumeWithStats extends Volume {
  sessionCount: number;
  lastSessionAt: string | null;
}

export interface VolumeFormInput extends VolumeInput {
  volumeLabel?: string | null;
  description?: string | null;
}

export class ValidationError extends Error {
  constructor(public readonly errors: Record<string, string>) {
    super('Fiche invalide');
    this.name = 'ValidationError';
  }
}

function toVolume(r: VolumeRow): Volume {
  return {
    id: r.id,
    seriesId: r.series_id,
    title: r.title,
    author: r.author,
    volumeLabel: r.volume_label,
    sortIndex: r.sort_index,
    pageCount: r.page_count,
    currentPage: r.current_page,
    status: r.status,
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

/** Normalise et valide ; lève ValidationError si la fiche est invalide. */
function normalize(input: VolumeFormInput) {
  const v = validateVolume(input);
  if (!v.ok) throw new ValidationError(v.errors);
  return {
    title: input.title.trim(),
    author: input.author.trim(),
    volumeLabel: clean(input.volumeLabel),
    pageCount: input.pageCount ?? null,
    currentPage: input.currentPage ?? 0,
    status: input.status ?? 'to_read',
    description: clean(input.description),
  };
}

/** Bibliothèque : tomes les plus récemment actifs d'abord. */
export async function listVolumes(db: DbLike): Promise<VolumeWithStats[]> {
  const rows = await db.getAllAsync<VolumeRow & { session_count: number; last_session_at: string | null }>(
    `SELECT v.*,
            (SELECT count(*) FROM reading_sessions s WHERE s.volume_id = v.id) AS session_count,
            (SELECT max(s.started_at) FROM reading_sessions s WHERE s.volume_id = v.id) AS last_session_at
       FROM volumes v
      ORDER BY coalesce(last_session_at, v.updated_at) DESC, v.title COLLATE NOCASE ASC`,
    [],
  );
  return rows.map((r) => ({ ...toVolume(r), sessionCount: r.session_count, lastSessionAt: r.last_session_at }));
}

export async function getVolume(db: DbLike, id: Id): Promise<Volume | null> {
  const r = await db.getFirstAsync<VolumeRow>('SELECT * FROM volumes WHERE id = ?', [id]);
  return r ? toVolume(r) : null;
}

export async function createVolume(db: DbLike, id: Id, input: VolumeFormInput, nowIso: string): Promise<Volume> {
  const n = normalize(input);
  await db.runAsync(
    `INSERT INTO volumes (id, title, author, volume_label, page_count, current_page, status, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, n.title, n.author, n.volumeLabel, n.pageCount, n.currentPage, n.status, n.description, nowIso, nowIso],
  );
  const v = await getVolume(db, id);
  if (!v) throw new Error('Tome introuvable après création');
  return v;
}

export async function updateVolume(db: DbLike, id: Id, input: VolumeFormInput, nowIso: string): Promise<Volume> {
  const n = normalize(input);
  const res = await db.runAsync(
    `UPDATE volumes
        SET title = ?, author = ?, volume_label = ?, page_count = ?, current_page = ?, status = ?, description = ?, updated_at = ?
      WHERE id = ?`,
    [n.title, n.author, n.volumeLabel, n.pageCount, n.currentPage, n.status, n.description, nowIso, id],
  );
  if (res.changes !== 1) throw new Error('Tome introuvable');
  const v = await getVolume(db, id);
  if (!v) throw new Error('Tome introuvable');
  return v;
}
