/**
 * Catalogue général de la BnF, API SRU (gratuite, sans clé).
 * Notices au format UNIMARC (« unimarcxchange ») : seul format qui donne la
 * série et le numéro de tome de façon structurée (225$v, 461$v, 200$h).
 *
 * Champs utilisés :
 *   010$a ISBN · 101$a langue, $c langue d'origine · 200$a titre, $e
 *   complément, $h numéro de partie, $i titre de partie, $f/$g responsabilités ·
 *   210/214$c éditeur, $d date · 215$a pagination, $d format · 225$a/$v
 *   collection et numéro · 330$a résumé · 461$t/$v série et numéro ·
 *   608$a forme/genre · 700/701$a,$b auteurs.
 *
 * Pas de couverture : la BnF n'en fournit pas par API.
 */
import { classifyFormat } from './classify';
import { asIsbnQuery, pickIsbn } from '@/domain/isbn';
import { decodeXmlEntities, stripIsbd, tidy } from './text';
import type { BookCandidate } from './types';
import { volumeFromCatalog, volumeFromTitle } from './volumeNumber';

export const BNF_SRU = 'https://catalogue.bnf.fr/api/SRU';

/** Échappe une valeur pour une requête CQL entre guillemets. */
function cqlQuote(s: string): string {
  return `"${s.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim()}"`;
}

/**
 * Requête CQL : ISBN exact, sinon titre OU auteur contenant tous les mots.
 * Limitée aux documents imprimés (doctype « a ») : écarte disques et vidéos.
 */
export function buildBnfQuery(query: string): string {
  const isbn = asIsbnQuery(query);
  if (isbn) return `bib.isbn any "${isbn}"`;
  const q = cqlQuote(query);
  return `(bib.title all ${q} or bib.author all ${q}) and bib.doctype any "a"`;
}

export function buildBnfUrl(query: string, maximumRecords = 100, startRecord = 1): string {
  const params = [
    'version=1.2',
    'operation=searchRetrieve',
    `query=${encodeURIComponent(buildBnfQuery(query))}`,
    'recordSchema=unimarcxchange',
    `maximumRecords=${maximumRecords}`,
    `startRecord=${startRecord}`,
  ];
  return `${BNF_SRU}?${params.join('&')}`;
}

type Subfields = { code: string; value: string }[];
type Fields = Map<string, Subfields[]>;

function parseRecord(xml: string): Fields {
  const fields: Fields = new Map();
  const re = /<mxc:datafield\b[^>]*\btag="(\d{3})"[^>]*>([\s\S]*?)<\/mxc:datafield>/g;
  for (const m of xml.matchAll(re)) {
    const tag = m[1] ?? '';
    const subs: Subfields = [];
    for (const s of (m[2] ?? '').matchAll(/<mxc:subfield\b[^>]*\bcode="(.)"[^>]*>([\s\S]*?)<\/mxc:subfield>/g)) {
      subs.push({ code: s[1] ?? '', value: decodeXmlEntities(s[2] ?? '') });
    }
    const list = fields.get(tag) ?? [];
    list.push(subs);
    fields.set(tag, list);
  }
  return fields;
}

const sub = (f: Subfields | undefined, code: string) => f?.find((s) => s.code === code)?.value ?? null;
const subs = (f: Subfields | undefined, code: string) => (f ?? []).filter((s) => s.code === code).map((s) => s.value);

function parsePages(extent: string | null): number | null {
  if (!extent || /non pagin/i.test(extent)) return null;
  const m = /(\d{1,5})\s*p\./.exec(extent);
  const n = m?.[1] ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 && n < 20000 ? n : null;
}

function personName(f: Subfields): string | null {
  const last = sub(f, 'a');
  const first = sub(f, 'b');
  if (!last) return null;
  return tidy(first ? `${first} ${last}` : last);
}

export function parseBnfRecord(recordXml: string, ark: string | null): BookCandidate | null {
  const f = parseRecord(recordXml);
  const t200 = f.get('200')?.[0];
  const titleA = stripIsbd(sub(t200, 'a'));
  if (!titleA) return null;
  const titleE = stripIsbd(sub(t200, 'e'));
  const partNumber = stripIsbd(sub(t200, 'h'));
  const partTitle = stripIsbd(sub(t200, 'i'));
  const responsibility = [...subs(t200, 'f'), ...subs(t200, 'g')].join(' ; ');

  const isbns = (f.get('010') ?? []).map((x) => sub(x, 'a'));
  const ean = (f.get('073') ?? []).map((x) => sub(x, 'a'));
  const isbn = pickIsbn([...isbns, ...ean]);

  const pubField = f.get('214')?.[0] ?? f.get('210')?.[0];
  const publisher = stripIsbd(sub(pubField, 'c'));
  const year = /\d{4}/.exec(sub(pubField, 'd') ?? '')?.[0] ?? null;

  const extentField = f.get('215')?.[0];
  const extent = tidy(sub(extentField, 'a'));
  const dims = tidy(sub(extentField, 'd'));
  const pageCount = parsePages(extent);

  // Notice d'ensemble (série entière, sans ISBN ni pagination) : écartée,
  // ce n'est pas une édition que l'on peut ajouter comme un tome.
  if (!isbn && !pageCount) return null;

  const lang = f.get('101')?.[0];
  const language = sub(lang, 'a');
  const originalLanguage = sub(lang, 'c');

  const s461 = f.get('461')?.[0];
  const s225 = f.get('225')?.[0];
  const seriesTitle = stripIsbd(sub(s461, 't')) ?? stripIsbd(sub(s225, 'a')) ?? (partNumber ? titleA : null);
  const catalogNumber = sub(s461, 'v') ?? sub(s225, 'v') ?? partNumber;

  // Titre de l'édition : titre propre (+ titre de partie s'il est numéroté).
  const title = tidy(partNumber && partTitle ? `${titleA} — ${partTitle}` : partTitle && !partNumber ? `${titleA}. ${partTitle}` : titleA) ?? titleA;
  const context = [titleA, titleE, partTitle].filter(Boolean).join(' ');
  const volume = volumeFromCatalog(catalogNumber, context) ?? volumeFromTitle(context, seriesTitle);

  const authors = [...(f.get('700') ?? []), ...(f.get('701') ?? [])]
    .filter((x) => {
      const role = sub(x, '4');
      return !role || role === '070';
    })
    .map(personName)
    .filter((n): n is string => !!n);

  const genres = (f.get('608') ?? []).map((x) => sub(x, 'a')).filter((g): g is string => !!g);
  const physical = tidy([extent, dims].filter(Boolean).join(' ; '));
  const { format, reasons } = classifyFormat({
    title: context,
    subtitle: titleE,
    responsibility,
    publisher,
    genres,
    physical,
    originalLanguage,
    pageCount,
  });

  const warnings: string[] = [];
  if (!pageCount) warnings.push(extent && /non pagin/i.test(extent) ? 'Non paginé' : 'Nombre de pages non indiqué');
  if (!isbn) warnings.push('ISBN absent');
  if (volume && !volume.confident) warnings.push('Numéro de tome déduit du titre, à vérifier');

  const id = ark ?? (isbn ? `isbn:${isbn}` : `title:${title}`);
  return {
    id: `bnf:${id}`,
    source: 'bnf',
    sources: ['bnf'],
    sourceRef: `bnf:${id}`,
    title,
    subtitle: titleE,
    // 200$d titre parallèle ; 510 titre parallèle ; 517 autres variantes du titre.
    altTitles: [...subs(t200, 'd'), ...['510', '517'].flatMap((tag) => (f.get(tag) ?? []).map((x) => sub(x, 'a')))]
      .map(stripIsbd)
      .filter((x): x is string => !!x && x !== title),
    authors,
    seriesTitle,
    volume,
    language,
    originalLanguage,
    publisher,
    publishedYear: year,
    isbn,
    pageCount,
    coverUrl: null,
    physical,
    format,
    formatReasons: reasons,
    description: tidy(sub(f.get('330')?.[0], 'a')),
    warnings,
  };
}

export class SourceResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceResponseError';
  }
}

/** Réponse SRU complète → éditions. Lève SourceResponseError si la réponse n'est pas une réponse SRU. */
export function parseBnfResponse(xml: string): { total: number; candidates: BookCandidate[] } {
  if (!/<srw:searchRetrieveResponse\b/.test(xml)) throw new SourceResponseError('réponse BnF inattendue');
  if (/<srw:diagnostics>/.test(xml) && !/<srw:record>/.test(xml)) throw new SourceResponseError('requête BnF refusée');
  const total = Number(/<srw:numberOfRecords>(\d+)/.exec(xml)?.[1] ?? 0);
  const candidates: BookCandidate[] = [];
  for (const rec of xml.split(/<srw:record>/).slice(1)) {
    const ark = /<mxc:record\b[^>]*\bid="(ark:[^"]+)"/.exec(rec)?.[1] ?? /<srw:recordIdentifier>(ark:[^<]+)</.exec(rec)?.[1] ?? null;
    const c = parseBnfRecord(rec, ark);
    if (c) candidates.push(c);
  }
  return { total, candidates };
}
