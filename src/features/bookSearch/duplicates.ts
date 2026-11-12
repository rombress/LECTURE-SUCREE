/**
 * Doublons : une édition trouvée est-elle déjà dans la bibliothèque ?
 *
 * 1. Même ISBN → doublon certain.
 * 2. Sinon, même titre normalisé ET même numéro de tome (et même série si
 *    l'on importe dans une série) → doublon probable.
 * Un doublon n'est jamais ajouté automatiquement : il est décoché et signalé.
 */
import type { DbLike } from '@/data/db/types';

import { normalizeForMatch } from './text';
import type { BookCandidate } from './types';

export interface ExistingVolumeKey {
  id: string;
  title: string;
  volumeLabel: string | null;
  sortIndex: number | null;
  seriesId: string | null;
  isbn: string | null;
}

export async function loadExistingKeys(db: DbLike): Promise<ExistingVolumeKey[]> {
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    volume_label: string | null;
    sort_index: number | null;
    series_id: string | null;
    isbn: string | null;
  }>('SELECT id, title, volume_label, sort_index, series_id, isbn FROM volumes', []);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    volumeLabel: r.volume_label,
    sortIndex: r.sort_index,
    seriesId: r.series_id,
    isbn: r.isbn,
  }));
}

export type DuplicateMatch = { kind: 'isbn' | 'title'; volumeId: string } | null;

export function findDuplicate(
  c: Pick<BookCandidate, 'isbn' | 'title' | 'volume'>,
  existing: readonly ExistingVolumeKey[],
  targetSeriesId: string | null = null,
): DuplicateMatch {
  if (c.isbn) {
    const hit = existing.find((e) => e.isbn === c.isbn);
    if (hit) return { kind: 'isbn', volumeId: hit.id };
  }
  const title = normalizeForMatch(c.title);
  const num = c.volume?.number ?? null;
  const hit = existing.find((e) => {
    if (normalizeForMatch(e.title) !== title) return false;
    if (targetSeriesId && e.seriesId && e.seriesId !== targetSeriesId) return false;
    // Deux tomes au même titre mais de numéros différents ne sont pas des doublons.
    if (num != null || e.sortIndex != null) return num === e.sortIndex;
    return true;
  });
  return hit ? { kind: 'title', volumeId: hit.id } : null;
}

/** Doublons À L'INTÉRIEUR d'une sélection (même ISBN, ou même série + même numéro + même langue). */
export function duplicatesWithinSelection(list: readonly BookCandidate[]): Set<string> {
  const seen = new Map<string, string>();
  const dup = new Set<string>();
  for (const c of list) {
    const keys = [
      c.isbn ? `isbn:${c.isbn}` : null,
      c.volume?.number != null ? `vol:${normalizeForMatch(c.seriesTitle ?? '')}|${c.language ?? ''}|${c.volume.label}` : null,
    ].filter((k): k is string => !!k);
    if (keys.some((k) => seen.has(k))) dup.add(c.id);
    keys.forEach((k) => seen.set(k, c.id));
  }
  return dup;
}
