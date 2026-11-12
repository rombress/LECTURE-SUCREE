/**
 * @jest-environment node
 *
 * Essai RÉEL contre les catalogues (réseau), désactivé par défaut.
 * Les recherches sont passées par variable d'environnement : aucune donnée
 * de lecture réelle n'est écrite dans le dépôt.
 *
 *   $env:BOOK_SEARCH_LIVE = "titre 1|titre 2"; npx.cmd jest live
 *   (option : $env:BOOK_SEARCH_LIVE_ENRICH = "5" pour relire les 5 premières éditions)
 *
 * Résultat écrit dans private/ (ignoré par Git).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';

import { createHttpClient, type FetchLike } from '../http';
import { isHiddenByDefault } from '../rank';
import { enrichCandidate, OL_SPACING_MS, searchBooks } from '../search';
import type { BookCandidate } from '../types';

const queries = (process.env.BOOK_SEARCH_LIVE ?? '').split('|').map((q) => q.trim()).filter(Boolean);
const enrichCount = Number(process.env.BOOK_SEARCH_LIVE_ENRICH ?? 0);
const maybe = queries.length ? test : test.skip;

/** jest-expo remplace `fetch` par une imitation : on passe par node:https (redirections suivies). */
const nodeFetch: FetchLike = (url, init) =>
  new Promise((resolve, reject) => {
    const go = (u: string, hops: number) => {
      const req = request(u, { method: init?.method ?? 'GET', headers: init?.headers, signal: init?.signal }, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location && hops < 5) {
          res.resume();
          go(new URL(res.headers.location, u).toString(), hops + 1);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const type = String(res.headers['content-type'] ?? '');
          resolve({ ok: status >= 200 && status < 300, status, headers: { get: () => type }, text: async () => body });
        });
      });
      req.on('error', reject);
      req.end();
    };
    go(url, 0);
  });

function line(c: BookCandidate): string {
  const v = c.volume ? `${c.volume.label}[${c.volume.kind}${c.volume.origin === 'title' ? ',titre' : ''}${c.volume.confident ? '' : ',?'}]` : '—';
  return [
    c.format.padEnd(11),
    (c.language ?? '???').padEnd(4),
    v.padEnd(18),
    `« ${c.title} »`,
    c.seriesTitle ? `série=${c.seriesTitle}` : '',
    c.authors[0] ?? '(auteur ?)',
    c.publisher ?? '(éditeur ?)',
    c.isbn ?? '(ISBN ?)',
    c.pageCount ? `${c.pageCount} p.` : '(pages ?)',
    c.coverUrl ? 'couv.' : 'sans couv.',
    c.sources.join('+'),
    c.warnings.length ? `⚠ ${c.warnings.join(' ; ')}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

maybe(
  'recherche réelle',
  async () => {
    const http = createHttpClient(nodeFetch);
    const out: string[] = [];
    for (const q of queries) {
      const r = await searchBooks(q, http);
      out.push(`\n## « ${q} » — ${r.candidates.length} éditions retenues, hors-ligne=${r.offline}`);
      out.push(`Sources : ${JSON.stringify(r.status)}`);
      const shown = r.candidates.filter((c) => !isHiddenByDefault(c));
      const hidden = r.candidates.filter(isHiddenByDefault);
      out.push(`Affichées par défaut : ${shown.length} ; masquées (manga/autre) : ${hidden.length}`);
      shown.forEach((c) => out.push(`  ${line(c)}`));
      out.push('  --- masquées ---');
      hidden.forEach((c) => out.push(`  ${line(c)}`));
      if (enrichCount > 0) {
        out.push('  --- éditions exactes (avant ajout) ---');
        for (const c of shown.slice(0, enrichCount)) {
          const e = await enrichCandidate(c, http);
          out.push(`  ${line(e)}`);
          await new Promise((res) => setTimeout(res, OL_SPACING_MS));
        }
      }
      await new Promise((res) => setTimeout(res, OL_SPACING_MS));
    }
    mkdirSync('private', { recursive: true });
    writeFileSync('private/book-search-live.txt', out.join('\n'), 'utf8');
    process.stdout.write(out.join('\n'));
  },
  10 * 60 * 1000,
);
