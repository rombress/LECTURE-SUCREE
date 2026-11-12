/**
 * Fusion, filtrage et classement des éditions trouvées.
 *
 * - Fusion UNIQUEMENT par ISBN identique (même édition) : la couverture d'un
 *   catalogue peut alors compléter la notice d'un autre. Deux éditions
 *   différentes ne sont jamais mélangées.
 * - Pertinence : tous les mots de la recherche doivent figurer dans le titre,
 *   les autres titres, la série ou l'auteur (écarte un livre
 *   qui ne partage qu'un nombre avec le titre cherché).
 * - Ordre : français, puis anglais, puis autres langues ; light novels avant
 *   formats non précisés ; mangas et autres formats en dernier.
 */
import { asIsbnQuery } from '@/domain/isbn';
import { normalizeForMatch } from './text';
import type { BookCandidate } from './types';

export function mergeByIsbn(lists: readonly BookCandidate[][]): BookCandidate[] {
  const out: BookCandidate[] = [];
  const byIsbn = new Map<string, number>();
  for (const list of lists) {
    for (const c of list) {
      const idx = c.isbn ? byIsbn.get(c.isbn) : undefined;
      if (idx === undefined) {
        if (c.isbn) byIsbn.set(c.isbn, out.length);
        out.push({ ...c, sources: [...c.sources] });
        continue;
      }
      const a = out[idx];
      if (!a) continue;
      out[idx] = {
        ...a,
        sources: [...new Set([...a.sources, ...c.sources])],
        altTitles: [...new Set([...a.altTitles, ...c.altTitles, ...(c.title !== a.title ? [c.title] : [])])],
        coverUrl: a.coverUrl ?? c.coverUrl,
        coverSource: a.coverUrl ? a.coverSource : c.coverSource,
        bnfArk: a.bnfArk ?? c.bnfArk,
        bnfCoverFlag: a.bnfCoverFlag ?? c.bnfCoverFlag,
        pageCount: a.pageCount ?? c.pageCount,
        publisher: a.publisher ?? c.publisher,
        language: a.language ?? c.language,
        volume: a.volume?.origin === 'catalog' ? a.volume : (c.volume?.origin === 'catalog' ? c.volume : (a.volume ?? c.volume)),
        seriesTitle: a.seriesTitle ?? c.seriesTitle,
        authors: a.authors.length ? a.authors : c.authors,
        olWorkKey: a.olWorkKey ?? c.olWorkKey,
        warnings: a.pageCount || !c.pageCount ? a.warnings : a.warnings.filter((w) => !/pages/i.test(w)),
      };
    }
  }
  return out;
}

export function isRelevant(c: BookCandidate, query: string): boolean {
  const isbn = asIsbnQuery(query);
  if (isbn) return c.isbn === isbn;
  const words = normalizeForMatch(query).split(' ').filter(Boolean);
  if (!words.length) return false;
  const hay = ` ${normalizeForMatch([c.title, c.subtitle, c.seriesTitle, ...c.altTitles, ...c.authors].filter(Boolean).join(' '))} `;
  return words.every((w) => hay.includes(` ${w} `) || (w.length >= 4 && hay.includes(w)));
}

const LANG_SCORE: Record<string, number> = { fre: 3000, eng: 2000 };
const FORMAT_SCORE = { light_novel: 400, unknown: 200, manga: -4000, other: -5000 } as const;

export function score(c: BookCandidate): number {
  let s = (c.language ? (LANG_SCORE[c.language] ?? 500) : 300) + FORMAT_SCORE[c.format];
  if (c.volume) s += 20;
  if (c.coverUrl) s += 10;
  if (c.pageCount) s += 5;
  if (c.isbn) s += 5;
  if (c.volume?.kind === 'omnibus') s -= 15;
  return s;
}

/** Tri stable : score décroissant, puis série, puis numéro de tome croissant. */
export function rankCandidates(list: readonly BookCandidate[]): BookCandidate[] {
  return [...list].sort((a, b) => {
    const d = Math.floor(score(b) / 100) - Math.floor(score(a) / 100);
    if (d) return d;
    const sa = normalizeForMatch(a.seriesTitle ?? a.title);
    const sb = normalizeForMatch(b.seriesTitle ?? b.title);
    if (sa !== sb) return sa < sb ? -1 : 1;
    const na = a.volume?.number ?? Number.POSITIVE_INFINITY;
    const nb = b.volume?.number ?? Number.POSITIVE_INFINITY;
    if (na !== nb) return na - nb;
    return a.title.localeCompare(b.title, 'fr');
  });
}

/**
 * Signale les nombres de pages suspects : 3 tomes ou plus du même éditeur et
 * de la même série avec EXACTEMENT le même nombre de pages (constaté sur Open
 * Library : 280 p. pour de nombreux tomes différents). La valeur est gardée,
 * mais marquée « à vérifier ».
 */
export function flagSuspiciousPageCounts(list: readonly BookCandidate[]): BookCandidate[] {
  const key = (c: BookCandidate) =>
    c.pageCount ? `${normalizeForMatch(c.seriesTitle ?? '')}|${normalizeForMatch(c.publisher)}|${c.pageCount}` : null;
  const counts = new Map<string, Set<string>>();
  for (const c of list) {
    const k = key(c);
    if (!k || !c.seriesTitle) continue;
    const vols = counts.get(k) ?? new Set<string>();
    vols.add(c.volume?.label ?? c.id);
    counts.set(k, vols);
  }
  const WARN = 'Même nombre de pages pour plusieurs tomes : valeur peut-être approximative';
  return list.map((c) => {
    const k = key(c);
    if (k && (counts.get(k)?.size ?? 0) >= 3 && !c.warnings.includes(WARN)) return { ...c, warnings: [...c.warnings, WARN] };
    return c;
  });
}

/** Les mangas et « autres formats » sont masqués par défaut (affichables sur demande). */
export const isHiddenByDefault = (c: BookCandidate) => c.format === 'manga' || c.format === 'other';
