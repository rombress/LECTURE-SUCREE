/**
 * Données de test FICTIVES (dépôt public) : titres, auteurs, éditeurs et
 * ISBN inventés, mais structurés comme les vraies réponses des catalogues
 * (relevées le 2026-11-12, voir docs/BOOK-SEARCH.md).
 */
import type { BookCandidate } from '../types';

/** ISBN-13 fictif à clé de contrôle valide (préfixe 979-10-99999). */
export function fakeIsbn(n: number): string {
  const core = `9791099999${String(n).padStart(2, '0')}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  return core + String((10 - (sum % 10)) % 10);
}

export function candidate(over: Partial<BookCandidate> = {}): BookCandidate {
  const id = over.id ?? `bnf:test-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    source: 'bnf',
    sources: ['bnf'],
    sourceRef: id,
    title: 'Saga fictive',
    subtitle: null,
    altTitles: [],
    authors: ['Auteur Fictif'],
    seriesTitle: 'Saga fictive',
    volume: { label: '1', number: 1, kind: 'regular', origin: 'catalog', confident: true },
    language: 'fre',
    originalLanguage: 'jpn',
    publisher: 'Éditions Fictives',
    publishedYear: '2020',
    isbn: fakeIsbn(1),
    pageCount: 300,
    coverUrl: null,
    coverSource: null,
    bnfArk: null,
    physical: '1 vol. (300 p.) ; 21 cm',
    format: 'light_novel',
    formatReasons: [],
    description: null,
    warnings: [],
    ...over,
  };
}

interface FakeRecord {
  ark: string;
  title: string;
  subtitle?: string;
  partNumber?: string;
  partTitle?: string;
  responsibility?: string;
  isbn?: string;
  publisher?: string;
  year?: string;
  extent?: string;
  dims?: string;
  series461?: { title: string; v: string };
  series225?: { title: string; v: string };
  lang?: string;
  original?: string;
  genre?: string;
  author?: { last: string; first?: string; role?: string };
  altTitle?: string;
}

const sf = (code: string, v: string) => `<mxc:subfield code="${code}">${v}</mxc:subfield>`;
const df = (tag: string, subs: string) => `<mxc:datafield tag="${tag}" ind1=" " ind2=" ">${subs}</mxc:datafield>`;

export function bnfRecord(r: FakeRecord): string {
  const fields = [
    r.isbn ? df('010', sf('a', r.isbn)) : '',
    df('101', sf('a', r.lang ?? 'fre') + (r.original ? sf('c', r.original) : '')),
    df(
      '200',
      sf('a', r.title) +
        sf('b', 'Texte imprimé') +
        (r.subtitle ? sf('e', r.subtitle) : '') +
        (r.partNumber ? sf('h', r.partNumber) : '') +
        (r.partTitle ? sf('i', r.partTitle) : '') +
        (r.responsibility ? sf('f', r.responsibility) : ''),
    ),
    df('214', sf('a', '[Ville Fictive]') + sf('c', r.publisher ?? 'Éditions Fictives') + sf('d', r.year ?? '2021')),
    r.extent || r.dims ? df('215', (r.extent ? sf('a', r.extent) : '') + (r.dims ? sf('d', r.dims) : '')) : '',
    r.series225 ? df('225', sf('a', r.series225.title) + sf('v', r.series225.v)) : '',
    r.series461 ? df('461', sf('t', r.series461.title) + sf('v', r.series461.v)) : '',
    r.altTitle ? df('517', sf('a', r.altTitle)) : '',
    r.genre ? df('608', sf('a', r.genre)) : '',
    r.author ? df('700', sf('a', r.author.last) + (r.author.first ? sf('b', r.author.first) : '') + sf('4', r.author.role ?? '070')) : '',
  ].join('');
  return `<srw:record><srw:recordData><mxc:record xmlns:mxc="info:lc/xmlns/marcxchange-v2" format="UNIMARC" id="${r.ark}" type="Bibliographic"><mxc:leader>     cam  22        450 </mxc:leader>${fields}</mxc:record></srw:recordData><srw:recordIdentifier>${r.ark}</srw:recordIdentifier></srw:record>`;
}

export function bnfResponse(records: string[], total = records.length): string {
  return `<?xml version="1.0" encoding="UTF-8"?><srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/"><srw:version>1.2</srw:version><srw:numberOfRecords>${total}</srw:numberOfRecords><srw:records>${records.join('\n')}</srw:records></srw:searchRetrieveResponse>`;
}
