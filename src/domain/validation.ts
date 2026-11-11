import { CATEGORIES, VOLUME_STATUSES, type CategoryId, type VolumeStatus } from './models';

export type ValidationResult = { ok: true } | { ok: false; errors: Record<string, string> };

export interface VolumeInput {
  title: string;
  author: string;
  pageCount?: number | null;
  currentPage?: number | null;
  status?: VolumeStatus;
}

const MAX_TITLE = 300;

/** Règles d'une fiche tome (miroir des contraintes CHECK de la base). */
export function validateVolume(input: VolumeInput): ValidationResult {
  const errors: Record<string, string> = {};
  const title = input.title?.trim() ?? '';
  const author = input.author?.trim() ?? '';

  if (!title) errors.title = 'Le titre est obligatoire.';
  else if (title.length > MAX_TITLE) errors.title = `Le titre dépasse ${MAX_TITLE} caractères.`;
  if (!author) errors.author = 'L’auteur est obligatoire.';
  else if (author.length > MAX_TITLE) errors.author = `L’auteur dépasse ${MAX_TITLE} caractères.`;

  const { pageCount, currentPage } = input;
  if (pageCount != null && (!Number.isInteger(pageCount) || pageCount <= 0)) {
    errors.pageCount = 'Le nombre de pages doit être un entier positif.';
  }
  if (currentPage != null && (!Number.isInteger(currentPage) || currentPage < 0)) {
    errors.currentPage = 'La page actuelle doit être un entier positif ou nul.';
  }
  if (pageCount != null && currentPage != null && !errors.pageCount && !errors.currentPage && currentPage > pageCount) {
    errors.currentPage = 'La page actuelle dépasse le nombre total de pages.';
  }
  if (input.status && !VOLUME_STATUSES.includes(input.status)) {
    errors.status = 'Statut inconnu.';
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true };
}

export interface SeriesInput {
  title: string;
  author?: string | null;
  description?: string | null;
}

export function validateSeries(input: SeriesInput): ValidationResult {
  const title = input.title?.trim() ?? '';
  if (!title) return { ok: false, errors: { title: 'Le titre de la série est obligatoire.' } };
  if (title.length > MAX_TITLE) return { ok: false, errors: { title: `Le titre dépasse ${MAX_TITLE} caractères.` } };
  return { ok: true };
}

/**
 * Position d'un tome dans sa série, déduite de son libellé :
 * « 3 » → 3, « Tome 12 » → 12, « T3 » → 3, « 3.5 » ou « 3,5 » → 3.5 ;
 * « Hors-série » → null (classé après les tomes numérotés).
 */
export function parseVolumeNumber(label: string | null | undefined): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(label ?? '');
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function isCategoryId(value: string): value is CategoryId {
  return CATEGORIES.some((c) => c.id === value);
}
