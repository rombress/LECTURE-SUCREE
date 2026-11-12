import {
  applyEdition,
  buildOpenLibrarySearchUrl,
  chooseEdition,
  olCoverById,
  parseOlSeries,
  parseOpenLibrarySearch,
  seriesFromTitle,
  type OlEditionJson,
} from '../openLibrary';

import { fakeIsbn } from './fixtures';

const search = {
  numFound: 3,
  docs: [
    {
      key: '/works/OL1W',
      title: 'サーガ―Vol.3',
      author_name: ['フィクション作家', 'Illustrateur Fictif'],
      author_alternative_name: ['Autre Personne'],
      edition_count: 4,
      number_of_pages_median: 250,
      editions: {
        docs: [{ key: '/books/OL11M', title: 'Fictional Saga, Vol. 3', language: ['eng'], isbn: [fakeIsbn(3)], publisher: ['Fictional Press'], cover_i: 123, publish_date: ['2020-03-31'], format: ['Paperback'] }],
      },
    },
    {
      key: '/works/OL2W',
      title: 'Fictional Saga, Vol. 1 (manga)',
      author_name: ['Fictional Author'],
      edition_count: 1,
      number_of_pages_median: 180,
      language: ['eng'],
      editions: { docs: [{ key: '/books/OL22M', title: 'Fictional Saga, Vol. 1 (manga)', isbn: [fakeIsbn(5)] }] },
    },
    { key: '/works/OL3W', title: 'Sans édition' },
  ],
};

describe('Open Library : recherche', () => {
  it('URL : préférence pour les éditions françaises, ISBN reconnu', () => {
    expect(buildOpenLibrarySearchUrl('Saga')).toContain('lang=fr');
    expect(buildOpenLibrarySearchUrl('0306406152')).toContain(`q=${encodeURIComponent('isbn:9780306406157')}`);
  });

  it('les infos viennent de l’ÉDITION retenue ; titre original gardé comme autre titre', () => {
    const { candidates } = parseOpenLibrarySearch(search);
    const c = candidates[0]!;
    expect(c).toMatchObject({
      title: 'Fictional Saga, Vol. 3',
      altTitles: ['サーガ―Vol.3'],
      language: 'eng',
      isbn: fakeIsbn(3),
      publisher: 'Fictional Press',
      coverUrl: olCoverById(123),
      volume: { number: 3, origin: 'title' },
      seriesTitle: 'Fictional Saga',
      publishedYear: '2020',
    });
  });

  it('médiane des pages de l’ŒUVRE ignorée si plusieurs éditions', () => {
    const [multi, single] = parseOpenLibrarySearch(search).candidates;
    expect(multi?.pageCount).toBeNull();
    expect(single?.pageCount).toBe(180);
  });

  it('auteur en écriture japonaise : gardé tel quel, AUCUNE variante latine devinée', () => {
    const c = parseOpenLibrarySearch(search).candidates[0]!;
    expect(c.authors).toEqual(['フィクション作家']);
    expect(c.warnings.join(' ')).toMatch(/écriture d’origine/);
  });

  it('langue de l’œuvre utilisée si l’édition n’en indique pas et qu’elle est unique', () => {
    expect(parseOpenLibrarySearch(search).candidates[1]?.language).toBe('eng');
  });

  it('œuvre sans édition ni titre exploitable : ignorée ; réponse invalide : erreur', () => {
    expect(parseOpenLibrarySearch(search).candidates).toHaveLength(3);
    expect(() => parseOpenLibrarySearch({ error: 'x' })).toThrow();
  });
});

describe('Open Library : séries et édition exacte', () => {
  it('série déduite du titre', () => {
    expect(seriesFromTitle('Fictional Saga (Light Novel) Vol. 4')).toBe('Fictional Saga');
    expect(seriesFromTitle('Fictional Saga, Vol. 2 (manga)')).toBe('Fictional Saga');
    expect(seriesFromTitle('Standalone Book')).toBeNull();
  });

  it('champ « series » d’édition', () => {
    expect(parseOlSeries(['Fictional Saga -- number 1'])).toMatchObject({ title: 'Fictional Saga', volume: { number: 1, origin: 'catalog' } });
    expect(parseOlSeries(['Fictional Saga ; v. 3']).volume?.number).toBe(3);
    expect(parseOlSeries(['Fictional Saga']).volume).toBeNull();
  });

  const eds: OlEditionJson[] = [
    { key: '/books/E1', title: 'Fictional Saga, Vol. 3', physical_format: 'ebook', isbn_13: [fakeIsbn(3)], languages: [{ key: '/languages/eng' }] },
    { key: '/books/E2', title: 'Fictional Saga, Vol. 3', physical_format: 'Paperback', isbn_13: [fakeIsbn(6)], number_of_pages: 240, covers: [77], languages: [{ key: '/languages/eng' }] },
    { key: '/books/E3', title: 'Saga Fictive, Vol. 3', physical_format: 'Broché', isbn_13: [fakeIsbn(7)], number_of_pages: 260, covers: [88], languages: [{ key: '/languages/ger' }] },
  ];

  it('choisit l’édition IMPRIMÉE de la même langue (pas l’ebook, pas une autre langue)', () => {
    expect(chooseEdition(eds, { isbn: fakeIsbn(3), language: 'eng' })?.key).toBe('/books/E2');
  });

  it('même ISBN imprimé : retenu en priorité', () => {
    expect(chooseEdition(eds, { isbn: fakeIsbn(7), language: 'eng' })?.key).toBe('/books/E3');
  });

  it('aucune édition dans la bonne langue → null', () => {
    expect(chooseEdition([eds[2]!], { isbn: null, language: 'eng' })).toBeNull();
  });

  it('pages, ISBN, couverture et éditeur viennent TOUS de la même édition', () => {
    const base = parseOpenLibrarySearch(search).candidates[0]!;
    const e = applyEdition(base, { ...eds[1]!, publishers: ['Fictional Press'], series: ['Fictional Saga -- number 3'] });
    expect(e).toMatchObject({
      isbn: fakeIsbn(6),
      pageCount: 240,
      coverUrl: olCoverById(77),
      publisher: 'Fictional Press',
      sourceRef: 'openlibrary:E2',
      volume: { number: 3, origin: 'catalog' },
      enriched: true,
    });
  });

  it('édition sans couverture : AUCUNE couverture empruntée à une autre édition', () => {
    const base = parseOpenLibrarySearch(search).candidates[0]!;
    const e = applyEdition(base, { key: '/books/E9', title: 'Fictional Saga, Vol. 3', isbn_13: [fakeIsbn(8)] });
    expect(e.coverUrl).toBeNull();
    expect(e.warnings).toContain('Pas de couverture pour cette édition');
    expect(e.pageCount).toBeNull();
  });
});
