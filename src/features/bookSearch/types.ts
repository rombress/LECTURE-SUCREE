/**
 * Résultat de recherche bibliographique : UNE édition précise d'un livre,
 * telle que décrite par UN catalogue (ou plusieurs, fusionnés par ISBN).
 *
 * Principe : rien n'est inventé. Une information absente reste `null` et
 * une information incertaine est signalée dans `warnings`.
 */

export type BookSource = 'bnf' | 'openlibrary' | 'google';

export const SOURCE_LABELS: Record<BookSource, string> = {
  bnf: 'BnF',
  openlibrary: 'Open Library',
  google: 'Google Books',
};

export type BookFormat = 'light_novel' | 'manga' | 'other' | 'unknown';

export const FORMAT_LABELS: Record<BookFormat, string> = {
  light_novel: 'Light novel',
  manga: 'Manga',
  other: 'Autre format',
  unknown: 'Format non précisé',
};

/**
 * regular : tome numéroté (3) ; decimal : tome intermédiaire (14.5) ;
 * special : hors-série, spin-off, recueil… ; omnibus : intégrale ou coffret.
 */
export type VolumeKind = 'regular' | 'decimal' | 'special' | 'omnibus';

export interface VolumeInfo {
  /** Libellé à afficher et à enregistrer (« 3 », « 14.5 », « 1-12 », « Alter 1 »). */
  label: string;
  /** Position pour le tri ; null si non numérique (hors-série). */
  number: number | null;
  kind: VolumeKind;
  /** catalog = champ structuré du catalogue ; title = déduit du titre. */
  origin: 'catalog' | 'title';
  /** false si le numéro est seulement probable (nombre isolé en fin de titre). */
  confident: boolean;
}

export interface BookCandidate {
  /** Identifiant stable : `<source>:<identifiant du catalogue>`. */
  id: string;
  source: BookSource;
  /** Catalogues ayant décrit cette même édition (même ISBN). */
  sources: BookSource[];
  /** Référence à conserver en base (ex. « bnf:ark:/12148/cb44420026t »). */
  sourceRef: string;
  title: string;
  subtitle: string | null;
  /** Autres titres connus de l'œuvre (titre original japonais, titre anglais…). */
  altTitles: string[];
  authors: string[];
  seriesTitle: string | null;
  volume: VolumeInfo | null;
  /** Code ISO 639-2 (« fre », « eng », « jpn »), null si inconnu. */
  language: string | null;
  /** Langue d'origine si traduction (BnF). */
  originalLanguage: string | null;
  publisher: string | null;
  publishedYear: string | null;
  /** ISBN-13 normalisé. */
  isbn: string | null;
  pageCount: number | null;
  /** Couverture DE CETTE ÉDITION (même ISBN / même notice), jamais d'une autre. */
  coverUrl: string | null;
  /** Support physique tel que décrit (« 21 cm », « Paperback », « eBook »). */
  physical: string | null;
  format: BookFormat;
  formatReasons: string[];
  description: string | null;
  warnings: string[];
  /** Open Library : œuvre (/works/…W), pour choisir l'édition imprimée exacte. */
  olWorkKey?: string | null;
  /** true une fois les détails de l'édition exacte récupérés (pages, ISBN, couverture). */
  enriched?: boolean;
}

export const LANGUAGE_LABELS: Record<string, string> = {
  fre: 'Français',
  eng: 'Anglais',
  jpn: 'Japonais',
  ger: 'Allemand',
  spa: 'Espagnol',
  ita: 'Italien',
  chi: 'Chinois',
  kor: 'Coréen',
  por: 'Portugais',
};

export function languageLabel(code: string | null): string {
  if (!code) return 'Langue inconnue';
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

/** Codes ISO 639-1 (Google Books) → 639-2 (BnF, Open Library). */
const ISO1_TO_2: Record<string, string> = {
  fr: 'fre',
  en: 'eng',
  ja: 'jpn',
  de: 'ger',
  es: 'spa',
  it: 'ita',
  zh: 'chi',
  ko: 'kor',
  pt: 'por',
};

export function toIso6392(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.toLowerCase().split('-')[0] ?? '';
  if (c.length === 3) return c === 'fra' ? 'fre' : c === 'deu' ? 'ger' : c;
  return ISO1_TO_2[c] ?? null;
}
