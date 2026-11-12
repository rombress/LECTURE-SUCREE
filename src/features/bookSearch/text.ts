/**
 * Normalisation de texte pour COMPARER des titres (jamais pour afficher).
 *
 * - NFKC : les chiffres et lettres pleine chasse des titres japonais
 *   (« ４２ ») deviennent des caractères ordinaires (« 42 »).
 * - Accents retirés, casse ignorée, ponctuation et tirets (—, ‐, ―, -) réduits
 *   à un espace.
 */
export function normalizeForMatch(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Décode les entités XML usuelles et numériques. */
export function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

/** Espaces multiples réduits, extrémités nettoyées ; null si vide. */
export function tidy(s: string | null | undefined): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length ? t : null;
}

/**
 * Retire la ponctuation ISBD de fin de zone (« Titre / », « Éditeur : »,
 * « [2015]- ») et les crochets des mentions restituées par le catalogueur.
 */
export function stripIsbd(s: string | null | undefined): string | null {
  const t = tidy(s);
  if (!t) return null;
  return tidy(t.replace(/[\s/:;,=.]+$/u, '').replace(/^\[(.*)\]$/u, '$1'));
}
