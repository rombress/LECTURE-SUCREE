/**
 * Numéro de tome d'une édition.
 *
 * Règles :
 * - Un numéro donné par un champ STRUCTURÉ du catalogue (BnF 461$v, 225$v,
 *   200$h) est prioritaire (origin « catalog »).
 * - Sinon il est cherché dans le titre, uniquement derrière un marqueur
 *   explicite (« Vol. », « Tome », « Ep. », « Volume deux ») ; un nombre
 *   isolé en fin de titre est accepté mais marqué « non sûr ».
 * - Le nombre qui FAIT PARTIE du nom de la série (« 42 », dans une série nommée « 42 ») n'est jamais pris
 *   pour un numéro de tome.
 * - Aucune conversion entre numérotations : un numéro vaut pour l'édition
 *   (langue + éditeur) qui le porte.
 */
import { normalizeForMatch } from './text';
import type { VolumeInfo, VolumeKind } from './types';

const FRENCH_NUMBERS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, 'dix sept': 17, 'dix huit': 18,
  'dix neuf': 19, vingt: 20,
};

const ROMAN = /^(?=[ivxl]+$)(x{0,3}|xl|l)(ix|iv|v?i{0,3})$/i;

function romanToInt(s: string): number | null {
  if (!s || !ROMAN.test(s)) return null;
  const v: Record<string, number> = { i: 1, v: 5, x: 10, l: 50 };
  let total = 0;
  const t = s.toLowerCase();
  for (let i = 0; i < t.length; i++) {
    const cur = v[t[i] ?? ''] ?? 0;
    const next = v[t[i + 1] ?? ''] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total > 0 ? total : null;
}

const SPECIAL_MARKERS = /\b(hors[- ]s[ée]rie|side stor(?:y|ies)|short stor(?:y|ies)|spin[- ]?off|alter|extra|sp[ée]cial|ex|gaiden|anthologie|anthology|guide ?book|fan ?book)\b/i;
const OMNIBUS_MARKERS = /\b(int[ée]grale|omnibus|coffret|box ?set|\d+[- ]book set|collector'?s edition set)\b/i;

function makeInfo(raw: string, origin: VolumeInfo['origin'], confident: boolean, context = ''): VolumeInfo | null {
  const label = raw.trim().replace(/^0+(?=\d)/, '').replace(',', '.');
  const range = /^(\d+)\s*[-–à]\s*(\d+)$/.exec(label);
  if (range) {
    return { label: `${Number(range[1])}-${Number(range[2])}`, number: Number(range[1]), kind: 'omnibus', origin, confident };
  }
  let n: number | null = null;
  if (/^\d+(\.\d+)?$/.test(label)) n = Number(label);
  else n = FRENCH_NUMBERS[normalizeForMatch(label)] ?? romanToInt(label);
  if (n == null || !Number.isFinite(n) || n <= 0 || n > 999) return null;
  let kind: VolumeKind = Number.isInteger(n) ? 'regular' : 'decimal';
  if (OMNIBUS_MARKERS.test(context)) kind = 'omnibus';
  else if (SPECIAL_MARKERS.test(context)) kind = 'special';
  const shown = String(n);
  return { label: kind === 'special' ? specialLabel(context, shown) : shown, number: n, kind, origin, confident };
}

function specialLabel(context: string, n: string): string {
  const m = SPECIAL_MARKERS.exec(context);
  const word = m?.[1] ? m[1].replace(/^./, (c) => c.toUpperCase()) : 'Spécial';
  return `${word} ${n}`;
}

/** Numéro donné par un champ structuré du catalogue (« 001 », « 3 », « I », « Volume deux »). */
export function volumeFromCatalog(raw: string | null | undefined, context = ''): VolumeInfo | null {
  if (!raw) return null;
  const t = raw.replace(/^(tome|t\.|vol(?:ume)?\.?|n[°o]\.?)\s*/i, '').trim();
  return makeInfo(t, 'catalog', true, context);
}

/**
 * Numéro déduit du titre. `seriesTitle` (si connu) est retiré d'abord pour
 * ne pas confondre « 42 » (nom de série) avec un tome.
 */
export function volumeFromTitle(title: string, seriesTitle?: string | null): VolumeInfo | null {
  const t = title.normalize('NFKC');
  // Intégrale / coffret : « Vol. 1-12 », « Vol.1-11 », « 12-Book Set ».
  const range = /\bvol(?:ume)?s?\.?\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\b/i.exec(t);
  if (range) return makeInfo(`${range[1]}-${range[2]}`, 'title', true, t);
  const explicit =
    /\b(?:vol(?:ume)?|tome|t|ep|episode|book|livre|n[°o])\.?\s*(\d{1,3}(?:[.,]\d)?)(?!\d)/i.exec(t) ??
    /\bvolume\s+(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt)\b/i.exec(t);
  if (explicit?.[1]) return makeInfo(explicit[1], 'title', true, t);
  const special = new RegExp(`${SPECIAL_MARKERS.source}\\.?\\s*(\\d{1,3}(?:[.,]\\d)?)\\b`, 'i').exec(t);
  if (special?.[2]) return makeInfo(special[2], 'title', true, t);
  // Le titre se réduit au nom de la série (« 42 ») : aucun numéro.
  if (seriesTitle && normalizeForMatch(t) === normalizeForMatch(seriesTitle)) return null;
  // « Titre [13] » ou « Titre (9) » : probable, non sûr.
  const bracket = /[[(]\s*(\d{1,3}(?:[.,]\d)?)\s*[\])]/.exec(t);
  if (bracket?.[1]) return makeInfo(bracket[1], 'title', false, t);
  // Mentions de format ou d'import retirées avant de chercher un nombre final :
  // « Saga 25 (light novel) », « Saga 2 - light novel », « Saga 9 [Japan Import] ».
  const bare = t
    .replace(/[\s,:—–-]*[([]\s*(?:light novel|manga|novel|japan import|japanese edition)\s*[)\]]\s*$/i, '')
    .replace(/\s+[-–—]\s+(?:light novel|manga)\s*$/i, '')
    .trim();
  // « Saga 2: Sous-titre » : nombre juste avant le sous-titre.
  const beforeSubtitle = /^(.*\S)\s+(\d{1,3}(?:[.,]\d)?)\s*:\s+\S/.exec(bare);
  if (beforeSubtitle?.[1] && beforeSubtitle[2] && normalizeForMatch(beforeSubtitle[1]).length >= 2 && !/^\d+$/.test(normalizeForMatch(beforeSubtitle[1]))) {
    return makeInfo(beforeSubtitle[2], 'title', false, t);
  }
  // Nombre isolé en fin de titre, précédé d'au moins un mot (« Saga 19 ») :
  // probable, non sûr. « 42 » seul n'est jamais un numéro de tome.
  const trailing = /^(.*\S)\s+(\d{1,3}(?:[.,]\d)?)\s*$/.exec(bare);
  if (trailing?.[1] && trailing[2]) {
    const head = normalizeForMatch(trailing[1]);
    if (head.length >= 2 && !/^\d+$/.test(head)) return makeInfo(trailing[2], 'title', false, t);
  }
  return null;
}
