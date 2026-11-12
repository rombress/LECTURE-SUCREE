import { buildBnfQuery, buildBnfUrl, parseBnfResponse, SourceResponseError } from '../bnf';

import { bnfRecord, bnfResponse, fakeIsbn } from './fixtures';

const LN = bnfRecord({
  ark: 'ark:/12148/cbTEST001',
  title: 'Premier arc',
  responsibility: 'Auteur Fictif ; [illustrations de] Illustrateur Fictif',
  isbn: fakeIsbn(1),
  publisher: 'Éditions Fictives',
  year: '[2015]-',
  extent: '1 vol. (514 p.)',
  dims: '21 cm',
  series225: { title: 'Saga fictive', v: '001' },
  series461: { title: 'Saga fictive', v: '1' },
  original: 'jpn',
  genre: 'Romans',
  author: { last: 'Fictif', first: 'Auteur' },
  altTitle: 'Saga fictive en VO',
  cover856: true,
});

const MANGA = bnfRecord({
  ark: 'ark:/12148/cbTEST002',
  title: 'Saga fictive, premier arc',
  partNumber: '002',
  responsibility: 'comic, Dessinateur Fictif ; writer, Auteur Fictif',
  isbn: fakeIsbn(2),
  publisher: 'Kana',
  extent: '1 vol. (non paginé [ca 192] p.)',
  dims: '18 cm',
});

const SET_RECORD = bnfRecord({ ark: 'ark:/12148/cbTEST003', title: 'Saga fictive', dims: '21 cm' });

const ENTITIES = bnfRecord({
  ark: 'ark:/12148/cbTEST004',
  title: 'Contes &amp; l&#233;gendes',
  isbn: fakeIsbn(4),
  extent: '1 vol. (200 p.)',
  partNumber: '3',
  partTitle: 'Le retour',
});

describe('BnF (SRU, UNIMARC)', () => {
  it('requête : ISBN exact, sinon titre OU auteur, imprimés seulement', () => {
    expect(buildBnfQuery('978-0-306-40615-7')).toBe('bib.isbn any "9780306406157"');
    expect(buildBnfQuery('Saga "fictive"')).toBe('bib.anywhere all "Saga fictive" and bib.doctype any "a"');
    expect(buildBnfUrl('saga')).toContain('recordSchema=unimarcxchange');
  });

  it('light novel français : série, tome, pages, ISBN, éditeur, langue — tous de la même notice', () => {
    const { candidates } = parseBnfResponse(bnfResponse([LN]));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: 'bnf:ark:/12148/cbTEST001',
      title: 'Premier arc',
      seriesTitle: 'Saga fictive',
      volume: { label: '1', number: 1, origin: 'catalog', confident: true },
      isbn: fakeIsbn(1),
      pageCount: 514,
      publisher: 'Éditions Fictives',
      publishedYear: '2015',
      language: 'fre',
      originalLanguage: 'jpn',
      authors: ['Auteur Fictif'],
      format: 'light_novel',
      coverUrl: null,
      altTitles: ['Saga fictive en VO'],
      bnfArk: 'ark:/12148/cbTEST001',
      bnfCoverFlag: true,
    });
  });

  it('manga : reconnu, non paginé signalé, numéro de partie (200$h) utilisé', () => {
    const [m] = parseBnfResponse(bnfResponse([MANGA])).candidates;
    expect(m?.format).toBe('manga');
    expect(m?.pageCount).toBeNull();
    expect(m?.warnings).toContain('Non paginé');
    expect(m?.volume?.number).toBe(2);
    expect(m?.bnfCoverFlag).toBe(false);
  });

  it('notice d’ensemble sans ISBN ni pagination : écartée', () => {
    expect(parseBnfResponse(bnfResponse([SET_RECORD, LN])).candidates.map((c) => c.id)).toEqual(['bnf:ark:/12148/cbTEST001']);
  });

  it('entités XML décodées ; titre de partie ajouté au titre', () => {
    const [c] = parseBnfResponse(bnfResponse([ENTITIES])).candidates;
    expect(c?.title).toBe('Contes & légendes — Le retour');
    expect(c?.volume?.number).toBe(3);
  });

  it('total conservé, réponse vide acceptée', () => {
    expect(parseBnfResponse(bnfResponse([], 0))).toEqual({ total: 0, candidates: [] });
    expect(parseBnfResponse(bnfResponse([LN], 250)).total).toBe(250);
  });

  it('réponse non SRU (page d’erreur HTML) : erreur explicite', () => {
    expect(() => parseBnfResponse('<html>Erreur</html>')).toThrow(SourceResponseError);
    expect(() =>
      parseBnfResponse('<srw:searchRetrieveResponse><srw:diagnostics><diag/></srw:diagnostics></srw:searchRetrieveResponse>'),
    ).toThrow(SourceResponseError);
  });
});
