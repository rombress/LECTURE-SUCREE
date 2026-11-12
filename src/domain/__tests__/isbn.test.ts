import { asIsbnQuery, isValidIsbn10, isValidIsbn13, normalizeIsbn, pickIsbn } from '../isbn';

describe('ISBN', () => {
  it('valide la clé de contrôle ISBN-13 et ISBN-10', () => {
    expect(isValidIsbn13('9780306406157')).toBe(true);
    expect(isValidIsbn13('9780306406158')).toBe(false);
    expect(isValidIsbn10('0306406152')).toBe(true);
    expect(isValidIsbn10('0306406153')).toBe(false);
    expect(isValidIsbn10('080442957X')).toBe(true);
  });

  it('normalise tirets et espaces, convertit ISBN-10 en ISBN-13', () => {
    expect(normalizeIsbn('978-0-306-40615-7')).toBe('9780306406157');
    expect(normalizeIsbn('0-306-40615-2')).toBe('9780306406157');
    expect(normalizeIsbn('978‐0‐306‐40615‐7')).toBe('9780306406157'); // tirets typographiques
    expect(normalizeIsbn('123')).toBeNull();
    expect(normalizeIsbn('')).toBeNull();
  });

  it('reconnaît une recherche par ISBN, et seulement elle', () => {
    expect(asIsbnQuery('ISBN 978-0-306-40615-7')).toBe('9780306406157');
    expect(asIsbnQuery('0306406152')).toBe('9780306406157');
    expect(asIsbnQuery('Saga fictive 2')).toBeNull();
    expect(asIsbnQuery('42')).toBeNull();
  });

  it('choisit le premier ISBN valide', () => {
    expect(pickIsbn([null, 'faux', '0306406152'])).toBe('9780306406157');
    expect(pickIsbn([])).toBeNull();
  });
});
