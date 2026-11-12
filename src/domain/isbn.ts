/**
 * ISBN : nettoyage, validation de la clé de contrôle, conversion ISBN-10 → 13.
 * Toute comparaison d'éditions se fait sur l'ISBN-13 normalisé.
 */

function digitsOnly(raw: string): string {
  return raw.replace(/[\s‐-―-]/g, '').toUpperCase();
}

export function isValidIsbn13(s: string): boolean {
  if (!/^97[89]\d{10}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(s[12]);
}

export function isValidIsbn10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
  return sum % 11 === 0;
}

/** ISBN-13 normalisé, ou null si la saisie n'est pas un ISBN valide. */
export function normalizeIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = digitsOnly(raw);
  if (isValidIsbn13(s)) return s;
  if (isValidIsbn10(s)) {
    const core = `978${s.slice(0, 9)}`;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
    return core + String((10 - (sum % 10)) % 10);
  }
  return null;
}

/** La recherche saisie est-elle un ISBN (et seulement un ISBN) ? */
export function asIsbnQuery(query: string): string | null {
  const s = digitsOnly(query.replace(/^isbn[:\s]*/i, ''));
  return /^[\dX]{10,13}$/.test(s) ? normalizeIsbn(s) : null;
}

/** Premier ISBN valide trouvé dans une liste (ISBN-13 privilégié). */
export function pickIsbn(values: readonly (string | null | undefined)[]): string | null {
  const all = values.map((v) => normalizeIsbn(v)).filter((v): v is string => !!v);
  return all[0] ?? null;
}
