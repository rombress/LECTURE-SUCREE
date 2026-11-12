/**
 * Recherche dans les catalogues gratuits (BnF, Open Library), en parallèle.
 * Une source en panne n'empêche pas d'afficher les résultats de l'autre ;
 * l'état de chaque source est rendu pour être affiché.
 */
import { bnfCoverUrl, buildBnfUrl, parseBnfResponse } from './bnf';
import { describeHttpError, HttpError, type HttpClient } from './http';
import {
  applyEdition,
  buildOpenLibrarySearchUrl,
  chooseEdition,
  olCoverByIsbn,
  olWorkEditionsUrl,
  parseOpenLibrarySearch,
  parseWorkEditions,
} from './openLibrary';
import { flagSuspiciousPageCounts, isRelevant, mergeByIsbn, rankCandidates } from './rank';
import type { BookCandidate, BookSource } from './types';

export type SourceStatus =
  | { state: 'ok'; found: number; kept: number; truncated: boolean }
  | { state: 'error'; message: string; offline: boolean };

export interface SearchResult {
  query: string;
  candidates: BookCandidate[];
  status: Partial<Record<BookSource, SourceStatus>>;
  /** Toutes les sources ont échoué faute de réseau. */
  offline: boolean;
}

const BNF_MAX = 100;

async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    // Une seule nouvelle tentative, et seulement pour un échec réseau
    // passager (observé : résolution DNS intermittente de la BnF).
    if (signal?.aborted || !(e instanceof HttpError) || (e.kind !== 'offline' && e.kind !== 'timeout')) throw e;
    return fn();
  }
}

function errorStatus(e: unknown): SourceStatus {
  return { state: 'error', message: describeHttpError(e), offline: e instanceof HttpError && e.kind === 'offline' };
}

export async function searchBooks(query: string, http: HttpClient, signal?: AbortSignal): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { query: q, candidates: [], status: {}, offline: false };
  const status: SearchResult['status'] = {};

  const bnf = withRetry(() => http.getText(buildBnfUrl(q, BNF_MAX), { signal, timeoutMs: 20000 }), signal)
    .then((xml) => {
      const r = parseBnfResponse(xml);
      const kept = r.candidates.filter((c) => isRelevant(c, q));
      status.bnf = { state: 'ok', found: r.total, kept: kept.length, truncated: r.total > BNF_MAX };
      return kept;
    })
    .catch((e: unknown) => {
      status.bnf = errorStatus(e);
      return [] as BookCandidate[];
    });

  const ol = withRetry(() => http.getText(buildOpenLibrarySearchUrl(q), { signal, timeoutMs: 15000 }), signal)
    .then((text) => {
      const r = parseOpenLibrarySearch(JSON.parse(text));
      const kept = r.candidates.filter((c) => isRelevant(c, q));
      status.openlibrary = { state: 'ok', found: r.total, kept: kept.length, truncated: r.total > r.candidates.length };
      return kept;
    })
    .catch((e: unknown) => {
      status.openlibrary = errorStatus(e);
      return [] as BookCandidate[];
    });

  const [fromBnf, fromOl] = await Promise.all([bnf, ol]);
  if (signal?.aborted) throw new HttpError('cancelled');
  const candidates = flagSuspiciousPageCounts(rankCandidates(mergeByIsbn([fromBnf, fromOl])));
  const statuses = Object.values(status);
  const offline = statuses.length > 0 && statuses.every((s) => s.state === 'error' && s.offline);
  return { query: q, candidates, status, offline };
}

/**
 * Complète une édition choisie, AVANT l'ajout :
 * - Open Library : relit l'édition imprimée exacte (pages, ISBN, couverture
 *   de cette même édition) ;
 * - BnF sans couverture : cherche la couverture de CE MÊME ISBN sur Open
 *   Library (URL vérifiée au téléchargement ; absente le plus souvent pour
 *   les éditions françaises).
 * En cas d'échec réseau, le résultat d'origine est rendu, avec un avertissement.
 */
export async function enrichCandidate(c: BookCandidate, http: HttpClient, signal?: AbortSignal): Promise<BookCandidate> {
  if (c.enriched) return c;
  if (c.source === 'openlibrary' && c.olWorkKey) {
    try {
      const editions = parseWorkEditions(JSON.parse(await http.getText(olWorkEditionsUrl(c.olWorkKey), { signal })));
      const e = chooseEdition(editions, { isbn: c.isbn, language: c.language });
      if (e) return applyEdition(c, e);
      return { ...c, enriched: true, warnings: [...c.warnings, 'Édition exacte introuvable : informations à vérifier'] };
    } catch (e) {
      if (signal?.aborted) throw e;
      return { ...c, warnings: [...c.warnings, 'Détails de l’édition non récupérés (réseau)'] };
    }
  }
  const warnings = [...c.warnings];
  // 1. Couverture BnF de CETTE notice (prioritaire pour les éditions françaises).
  //    La miniature (≈ 5 Ko) sert de test : la BnF refuse HEAD (405) et répond
  //    500 quand la notice n'a pas de couverture (documenté) → « missing ».
  if (c.bnfArk) {
    const probe = await http.probeImage(bnfCoverUrl(c.bnfArk, 'thumb'), { method: 'GET', signal });
    if (probe === 'found') return { ...c, coverUrl: bnfCoverUrl(c.bnfArk, 'large'), coverSource: 'bnf', enriched: true };
    if (probe === 'unreachable') warnings.push('Couverture BnF non vérifiée (réseau)');
  }
  // 2. Sinon, couverture du MÊME ISBN sur Open Library.
  if (!c.coverUrl && c.isbn) {
    const url = olCoverByIsbn(c.isbn);
    if ((await http.probeImage(url, { signal })) === 'found') return { ...c, coverUrl: url, coverSource: 'openlibrary', enriched: true, warnings };
  }
  if (!c.coverUrl) warnings.push('Pas de couverture trouvée pour cette édition');
  return { ...c, enriched: true, warnings };
}

/** Pause entre deux requêtes Open Library (limite documentée : 1 requête/s). */
export const OL_SPACING_MS = 1100;
