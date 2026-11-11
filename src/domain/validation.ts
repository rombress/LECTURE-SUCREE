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

export function isCategoryId(value: string): value is CategoryId {
  return CATEGORIES.some((c) => c.id === value);
}
