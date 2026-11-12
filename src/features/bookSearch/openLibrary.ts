/**
 * Open Library (Internet Archive) : gratuit, sans clé.
 * Limites documentées : 1 requête/s sans identification ; couvertures par
 * identifiant (cover_i) non limitées, par ISBN limitées à 100 / 5 min / IP.
 * https://openlibrary.org/developers/api · /dev/docs/api/covers
 *
 * search.json renvoie des ŒUVRES, chacune avec l'édition qui correspond le
 * mieux. Les pages, l'ISBN et la couverture affichés viennent de CETTE
 * édition. Avant l'ajout, l'édition imprimée exacte est relue
 * (`chooseEdition`) pour que pages, ISBN et couverture concordent.
 */
import { classifyFormat } from './classify';
import { asIsbnQuery, pickIsbn } from '@/domain/isbn';
import { normalizeForMatch, tidy } from './text';
import type { BookCandidate, VolumeInfo } from './types';
import { volumeFromCatalog, volumeFromTitle } from './volumeNumber';

export const OL_ORIGIN = 'https://openlibrary.org';

const SEARCH_FIELDS = [
  'key', 'title', 'subtitle', 'alternative_title', 'author_name', 'author_alternative_name', 'edition_count',
  'language', 'number_of_pages_median', 'first_publish_year', 'subject',
  'editions', 'editions.key', 'editions.title', 'editions.subtitle', 'editions.language', 'editions.isbn',
  'editions.publisher', 'editions.cover_i', 'editions.publish_date', 'editions.format',
].join(',');

export function buildOpenLibrarySearchUrl(query: string, limit = 60): string {
  const isbn = asIsbnQuery(query);
  const q = isbn ? `isbn:${isbn}` : query.trim();
  // lang=fr : à œuvre égale, Open Library choisit de préférence l'édition française.
  return `${OL_ORIGIN}/search.json?q=${encodeURIComponent(q)}&lang=fr&limit=${limit}&fields=${SEARCH_FIELDS}`;
}

export const olCoverById = (id: number, size: 'M' | 'L' = 'L') => `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;
/** Couverture par ISBN : limitée par Open Library, à n'utiliser que pour une édition choisie. */
export const olCoverByIsbn = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const asString = (v: unknown): string | null => (typeof v === 'string' ? tidy(v) : null);
const asNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isLatin = (s: string) => /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}]+$/u.test(s);

/** Série déduite du titre d'une édition (« Saga (Light Novel) Vol. 4 » → « Saga »). */
export function seriesFromTitle(title: string): string | null {
  const t = title.normalize('NFKC');
  const cut = /^(.*?)(?:[\s,:—–-]*\((?:light novel|manga|novel)\))?[\s,:—–-]*\b(?:vol(?:ume)?s?|tome|ep|book|livre)\.?\s*\d/i.exec(t);
  return tidy(cut?.[1]?.replace(/[\s,:—–-]+$/u, '')) ?? null;
}

/** Série et numéro d'un champ `series` d'édition (« Saga -- number 1 », « Saga ; v. 3 », « Saga #2 »). */
export function parseOlSeries(values: readonly string[]): { title: string | null; volume: VolumeInfo | null } {
  for (const raw of values) {
    const m = /^(.*?)\s*(?:--\s*number|;\s*v\.|,\s*v\.|#|\bvol\.?|\bno\.)\s*(\d{1,3}(?:\.\d)?)\s*$/i.exec(raw);
    if (m?.[1]) return { title: tidy(m[1].replace(/[\s,;:(]+$/u, '')), volume: volumeFromCatalog(m[2], raw) };
    const t = tidy(raw.replace(/[\s,;:(]+$/u, ''));
    if (t) return { title: t, volume: null };
  }
  return { title: null, volume: null };
}

interface OlEditionDoc {
  key?: string;
  title?: string;
  subtitle?: string;
  language?: string[];
  isbn?: string[];
  publisher?: string[];
  cover_i?: number;
  publish_date?: string[];
  format?: string[];
}

interface OlWorkDoc {
  key?: string;
  title?: string;
  subtitle?: string;
  alternative_title?: string[];
  author_name?: string[];
  author_alternative_name?: string[];
  edition_count?: number;
  language?: string[];
  number_of_pages_median?: number;
  subject?: string[];
  editions?: { docs?: OlEditionDoc[] };
}

function pickAuthor(work: OlWorkDoc): { authors: string[]; warning: string | null } {
  const names = asStrings(work.author_name);
  const first = names[0];
  if (!first) return { authors: [], warning: null };
  if (isLatin(first)) return { authors: [first], warning: null };
  // Nom en écriture japonaise. Les variantes latines d'Open Library mélangent
  // auteurs, illustrateurs et traducteurs (vérifié le 2026-11-12 : le nom d'une
  // autre personne y figurait en premier) : aucune n'est choisie automatiquement.
  return { authors: [first], warning: 'Nom d’auteur en écriture d’origine, à modifier si besoin' };
}

function yearOf(dates: readonly string[]): string | null {
  for (const d of dates) {
    const y = /\b(1[5-9]\d\d|20\d\d)\b/.exec(d)?.[1];
    if (y) return y;
  }
  return null;
}

export function parseOpenLibrarySearch(json: unknown): { total: number; candidates: BookCandidate[] } {
  if (!json || typeof json !== 'object' || !Array.isArray((json as { docs?: unknown }).docs)) {
    throw new Error('réponse Open Library inattendue');
  }
  const body = json as { numFound?: number; docs: OlWorkDoc[] };
  const candidates: BookCandidate[] = [];
  for (const work of body.docs) {
    const ed = work.editions?.docs?.[0];
    const workKey = asString(work.key);
    const title = asString(ed?.title) ?? asString(work.title);
    if (!title || !workKey) continue;
    const workTitle = asString(work.title);
    const altTitles = [...(workTitle && workTitle !== title ? [workTitle] : []), ...asStrings(work.alternative_title)]
      .map((x) => tidy(x))
      .filter((x): x is string => !!x && x !== title)
      .slice(0, 6);
    const subtitle = asString(ed?.subtitle);
    const formatList = asStrings(ed?.format);
    const physical = tidy(formatList.join(', '));
    // Langue de l'édition ; à défaut, celle de l'œuvre si elle est unique.
    const workLanguages = asStrings(work.language);
    const language = asStrings(ed?.language)[0] ?? (workLanguages.length === 1 ? (workLanguages[0] ?? null) : null);
    const publisher = tidy(asStrings(ed?.publisher)[0]);
    const isbn = pickIsbn(asStrings(ed?.isbn));
    const editionCount = asNumber(work.edition_count) ?? 0;
    // La médiane des pages est celle de l'ŒUVRE : fiable seulement si l'œuvre n'a qu'une édition.
    const median = asNumber(work.number_of_pages_median);
    const pageCount = editionCount === 1 && median && median > 0 ? Math.round(median) : null;
    const seriesTitle = seriesFromTitle(title);
    const volume = volumeFromTitle(title, seriesTitle);
    const { authors, warning } = pickAuthor(work);
    const { format, reasons } = classifyFormat({
      title: [title, workTitle].filter(Boolean).join(' '),
      subtitle,
      publisher,
      physical,
      categories: asStrings(work.subject).slice(0, 30),
    });
    const warnings: string[] = [];
    if (warning) warnings.push(warning);
    if (!pageCount) warnings.push('Pages : lues sur l’édition exacte avant l’ajout');
    if (volume && !volume.confident) warnings.push('Numéro de tome déduit du titre, à vérifier');
    const editionKey = asString(ed?.key)?.replace('/books/', '') ?? null;
    const id = editionKey ?? workKey.replace('/works/', '');
    candidates.push({
      id: `openlibrary:${id}`,
      source: 'openlibrary',
      sources: ['openlibrary'],
      sourceRef: `openlibrary:${id}`,
      title,
      subtitle,
      altTitles,
      authors,
      seriesTitle,
      volume,
      language,
      originalLanguage: null,
      publisher,
      publishedYear: yearOf(asStrings(ed?.publish_date)),
      isbn,
      pageCount,
      coverUrl: typeof ed?.cover_i === 'number' ? olCoverById(ed.cover_i) : null,
      coverSource: typeof ed?.cover_i === 'number' ? 'openlibrary' : null,
      physical,
      format,
      formatReasons: reasons,
      description: null,
      warnings,
      olWorkKey: workKey,
      enriched: false,
    });
  }
  return { total: asNumber(body.numFound) ?? candidates.length, candidates };
}

// ---------------------------------------------------------------------------
// Édition exacte (avant l'ajout)

export interface OlEditionJson {
  key?: string;
  title?: string;
  subtitle?: string;
  number_of_pages?: number;
  isbn_13?: string[];
  isbn_10?: string[];
  publishers?: string[];
  languages?: { key?: string }[];
  covers?: number[];
  series?: string[];
  physical_format?: string;
  publish_date?: string;
}

export const olWorkEditionsUrl = (workKey: string) => `${OL_ORIGIN}${workKey}/editions.json?limit=50`;

const NON_PRINT = /\b(e ?book|ebook|kindle|audio|audiobook|cd|mp3|digital)\b/;

function editionLanguage(e: OlEditionJson): string | null {
  const k = e.languages?.[0]?.key;
  return k ? (k.split('/').pop() ?? null) : null;
}

/**
 * Choisit, parmi les éditions d'une œuvre, celle qui correspond au résultat
 * affiché : même ISBN si possible ; sinon même langue, imprimée, avec ISBN,
 * pages et couverture. Ne mélange JAMAIS deux éditions.
 */
export function chooseEdition(editions: readonly OlEditionJson[], wanted: { isbn: string | null; language: string | null }): OlEditionJson | null {
  const withIsbn = (e: OlEditionJson) => pickIsbn([...asStrings(e.isbn_13), ...asStrings(e.isbn_10)]);
  const exact = wanted.isbn ? editions.find((e) => withIsbn(e) === wanted.isbn) : undefined;
  // L'édition affichée est introuvable (œuvre de plus de 50 éditions…) : on
  // n'en choisit PAS une autre au hasard ; l'appelant garde l'originale.
  if (wanted.isbn && !exact) return null;
  if (exact && !NON_PRINT.test(normalizeForMatch(exact.physical_format))) return exact;
  // Remplacer un ebook par l'imprimé exige une langue CONNUE et identique ;
  // sinon on garde l'édition affichée telle quelle.
  const language = wanted.language ?? (exact ? editionLanguage(exact) : null);
  if (!language) return exact ?? null;
  const scored = editions
    .filter((e) => editionLanguage(e) === language && !NON_PRINT.test(normalizeForMatch(e.physical_format)))
    .map((e) => {
      let s = 0;
      if (withIsbn(e)) s += 4;
      if (asNumber(e.number_of_pages)) s += 2;
      if (e.covers?.some((c) => c > 0)) s += 2;
      return { e, s };
    })
    .sort((a, b) => b.s - a.s);
  return scored[0]?.e ?? exact ?? null;
}

/** Applique l'édition exacte au résultat : pages, ISBN, éditeur, couverture et série viennent TOUS d'elle. */
export function applyEdition(c: BookCandidate, e: OlEditionJson): BookCandidate {
  const title = asString(e.title) ?? c.title;
  const isbn = pickIsbn([...asStrings(e.isbn_13), ...asStrings(e.isbn_10)]);
  const pages = asNumber(e.number_of_pages);
  const cover = e.covers?.find((x) => x > 0);
  const series = parseOlSeries(asStrings(e.series));
  const seriesTitle = series.title ?? seriesFromTitle(title) ?? c.seriesTitle;
  const volume = series.volume ?? volumeFromTitle(title, seriesTitle) ?? null;
  const physical = asString(e.physical_format);
  const editionKey = asString(e.key)?.replace('/books/', '') ?? null;
  const warnings = c.warnings.filter((w) => !w.startsWith('Pages :') && !w.startsWith('Numéro de tome'));
  if (!pages) warnings.push('Nombre de pages non indiqué');
  if (!isbn) warnings.push('ISBN absent');
  if (!cover) warnings.push('Pas de couverture pour cette édition');
  if (volume && !volume.confident) warnings.push('Numéro de tome déduit du titre, à vérifier');
  if (c.isbn && isbn !== c.isbn) warnings.push('Édition imprimée retenue à la place de l’édition affichée (ISBN différent) : vérifiez la fiche');
  const ref = editionKey ? `openlibrary:${editionKey}` : c.sourceRef;
  return {
    ...c,
    sourceRef: ref,
    title,
    subtitle: asString(e.subtitle),
    isbn,
    pageCount: pages && pages > 0 ? Math.round(pages) : null,
    publisher: tidy(asStrings(e.publishers)[0]) ?? null,
    language: editionLanguage(e) ?? c.language,
    coverUrl: cover ? olCoverById(cover) : null,
    coverSource: cover ? 'openlibrary' : null,
    seriesTitle,
    volume,
    physical,
    publishedYear: yearOf(e.publish_date ? [e.publish_date] : []) ?? c.publishedYear,
    warnings,
    enriched: true,
  };
}

export function parseWorkEditions(json: unknown): OlEditionJson[] {
  const entries = (json as { entries?: unknown } | null)?.entries;
  return Array.isArray(entries) ? (entries as OlEditionJson[]) : [];
}
