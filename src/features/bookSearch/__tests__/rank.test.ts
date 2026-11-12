import { flagSuspiciousPageCounts, isHiddenByDefault, isRelevant, mergeByIsbn, rankCandidates } from '../rank';

import { candidate, fakeIsbn } from './fixtures';

describe('fusion par ISBN', () => {
  it('même ISBN : une seule édition, la couverture de l’autre catalogue complète la notice', () => {
    const bnf = candidate({ id: 'bnf:a', isbn: fakeIsbn(1), coverUrl: null, pageCount: 300 });
    const ol = candidate({ id: 'openlibrary:b', source: 'openlibrary', sources: ['openlibrary'], isbn: fakeIsbn(1), coverUrl: 'https://covers.example.com/1.jpg', title: 'Fictional title' });
    const merged = mergeByIsbn([[bnf], [ol]]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'bnf:a', sources: ['bnf', 'openlibrary'], coverUrl: 'https://covers.example.com/1.jpg', pageCount: 300 });
    expect(merged[0]?.altTitles).toContain('Fictional title');
  });

  it('ISBN différents : jamais fusionnés (la couverture d’une autre édition n’est pas reprise)', () => {
    const a = candidate({ id: 'a', isbn: fakeIsbn(1), coverUrl: null });
    const b = candidate({ id: 'b', isbn: fakeIsbn(2), coverUrl: 'https://covers.example.com/2.jpg' });
    const merged = mergeByIsbn([[a], [b]]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.coverUrl).toBeNull();
  });

  it('sans ISBN : jamais fusionnés', () => {
    expect(mergeByIsbn([[candidate({ id: 'a', isbn: null })], [candidate({ id: 'b', isbn: null })]])).toHaveLength(2);
  });
});

describe('pertinence', () => {
  it('tous les mots doivent figurer dans titre, série, autres titres ou auteur', () => {
    const q = '42 quarante-deux';
    expect(isRelevant(candidate({ title: '42', seriesTitle: '42', subtitle: 'quarante-deux' }), q)).toBe(true);
    expect(isRelevant(candidate({ title: 'Avion F-42', seriesTitle: null, authors: ['Auteur Fictif'] }), q)).toBe(false);
    expect(isRelevant(candidate({ title: 'Premier arc', seriesTitle: 'Saga fictive' }), 'saga fictive')).toBe(true);
    expect(isRelevant(candidate({ title: 'Premier arc', seriesTitle: null, authors: ['Auteur Fictif'] }), 'auteur fictif')).toBe(true);
  });
  it('recherche par ISBN : seulement la même édition', () => {
    expect(isRelevant(candidate({ isbn: '9780306406157' }), '0-306-40615-2')).toBe(true);
    expect(isRelevant(candidate({ isbn: fakeIsbn(9) }), '0-306-40615-2')).toBe(false);
  });
});

describe('classement', () => {
  it('français, puis anglais, puis autres ; mangas et autres formats en dernier', () => {
    const list = [
      candidate({ id: 'manga-fr', language: 'fre', format: 'manga' }),
      candidate({ id: 'ln-en', language: 'eng' }),
      candidate({ id: 'ln-de', language: 'ger' }),
      candidate({ id: 'ln-fr', language: 'fre' }),
      candidate({ id: 'coloriage', language: 'fre', format: 'other' }),
    ];
    expect(rankCandidates(list).map((c) => c.id)).toEqual(['ln-fr', 'ln-en', 'ln-de', 'manga-fr', 'coloriage']);
  });

  it('même série : ordre des tomes, décimaux compris, tomes sans numéro à la fin', () => {
    const v = (label: string, number: number) => ({ label, number, kind: 'regular' as const, origin: 'catalog' as const, confident: true });
    const list = [
      candidate({ id: 't10', volume: v('10', 10) }),
      candidate({ id: 'tx', volume: null }),
      candidate({ id: 't2', volume: v('2', 2) }),
      candidate({ id: 't14.5', volume: { ...v('14.5', 14.5), kind: 'decimal' } }),
    ];
    // tx n'a pas de numéro : rang de score inférieur ; parmi les numérotés, ordre croissant.
    expect(rankCandidates(list).map((c) => c.id)).toEqual(['t2', 't10', 't14.5', 'tx']);
  });

  it('mangas et autres formats masqués par défaut, format non précisé visible', () => {
    expect(isHiddenByDefault(candidate({ format: 'manga' }))).toBe(true);
    expect(isHiddenByDefault(candidate({ format: 'other' }))).toBe(true);
    expect(isHiddenByDefault(candidate({ format: 'unknown' }))).toBe(false);
  });
});

describe('nombres de pages suspects', () => {
  it('3 tomes du même éditeur avec exactement le même nombre de pages : signalés', () => {
    const mk = (n: number) =>
      candidate({ id: `t${n}`, pageCount: 280, volume: { label: String(n), number: n, kind: 'regular', origin: 'title', confident: true } });
    const out = flagSuspiciousPageCounts([mk(1), mk(2), mk(3), candidate({ id: 'autre', pageCount: 300 })]);
    expect(out.filter((c) => c.warnings.some((w) => w.includes('approximative'))).map((c) => c.id)).toEqual(['t1', 't2', 't3']);
  });
});
