import { createHttpClient, describeHttpError, HttpError, type FetchLike, type HttpClient } from '../http';
import { enrichCandidate, searchBooks } from '../search';

import { bnfRecord, bnfResponse, candidate, fakeIsbn } from './fixtures';

const BNF_OK = bnfResponse([
  bnfRecord({
    ark: 'ark:/12148/cbT1',
    title: 'Premier arc',
    isbn: fakeIsbn(1),
    extent: '1 vol. (300 p.)',
    series461: { title: 'Saga fictive', v: '1' },
    genre: 'Romans',
    author: { last: 'Fictif', first: 'Auteur' },
  }),
  bnfRecord({ ark: 'ark:/12148/cbT2', title: 'Hors sujet', isbn: fakeIsbn(2), extent: '1 vol. (100 p.)' }),
]);

const OL_OK = JSON.stringify({
  numFound: 1,
  docs: [
    {
      key: '/works/OL1W',
      title: 'Fictional Saga, Vol. 1 (Light Novel)',
      author_name: ['Auteur Fictif'],
      edition_count: 1,
      number_of_pages_median: 250,
      editions: { docs: [{ key: '/books/OL1M', title: 'Saga fictive, Vol. 1 (Light Novel)', language: ['eng'], isbn: [fakeIsbn(3)], cover_i: 9 }] },
    },
  ],
});

type Route = (url: string) => string | Error;
function fakeHttp(route: Route): HttpClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getText(url) {
      calls.push(url);
      const r = route(url);
      if (r instanceof Error) throw r;
      return r;
    },
    async imageExists(url) {
      calls.push(`HEAD ${url}`);
      return url.includes(fakeIsbn(1));
    },
  };
}

const ok: Route = (u) => (u.includes('bnf.fr') ? BNF_OK : OL_OK);

describe('recherche combinée', () => {
  it('interroge les deux catalogues, garde les résultats pertinents, français en premier', async () => {
    const r = await searchBooks('saga fictive', fakeHttp(ok));
    expect(r.candidates.map((c) => c.language)).toEqual(['fre', 'eng']);
    expect(r.candidates.map((c) => c.title)).not.toContain('Hors sujet');
    expect(r.status.bnf).toMatchObject({ state: 'ok', kept: 1 });
    expect(r.status.openlibrary).toMatchObject({ state: 'ok', kept: 1 });
    expect(r.offline).toBe(false);
  });

  it('un catalogue en panne : les résultats de l’autre restent affichés, la panne est signalée', async () => {
    const r = await searchBooks('saga fictive', fakeHttp((u) => (u.includes('bnf.fr') ? new HttpError('http', 500) : OL_OK)));
    expect(r.candidates).toHaveLength(1);
    expect(r.status.bnf).toEqual({ state: 'error', message: 'Service indisponible (500)', offline: false });
    expect(r.offline).toBe(false);
  });

  it('aucune connexion : « hors ligne », aucun résultat inventé', async () => {
    const r = await searchBooks('saga fictive', fakeHttp(() => new HttpError('offline')));
    expect(r).toMatchObject({ candidates: [], offline: true });
  });

  it('échec réseau passager : UNE seule nouvelle tentative', async () => {
    let bnfCalls = 0;
    const http = fakeHttp((u) => {
      if (!u.includes('bnf.fr')) return OL_OK;
      bnfCalls++;
      return bnfCalls === 1 ? new HttpError('offline') : BNF_OK;
    });
    const r = await searchBooks('saga fictive', http);
    expect(bnfCalls).toBe(2);
    expect(r.status.bnf?.state).toBe('ok');
  });

  it('pas de nouvelle tentative sur une erreur du service (429)', async () => {
    let bnfCalls = 0;
    await searchBooks(
      'saga fictive',
      fakeHttp((u) => {
        if (!u.includes('bnf.fr')) return OL_OK;
        bnfCalls++;
        return new HttpError('rate_limited', 429);
      }),
    );
    expect(bnfCalls).toBe(1);
  });

  it('réponse illisible : signalée comme telle', async () => {
    const r = await searchBooks('saga fictive', fakeHttp((u) => (u.includes('bnf.fr') ? '<html>panne</html>' : 'pas du json')));
    expect(r.status.bnf).toMatchObject({ state: 'error', message: 'Réponse illisible' });
    expect(r.status.openlibrary).toMatchObject({ state: 'error', message: 'Réponse illisible' });
    expect(r.offline).toBe(false);
  });

  it('recherche vide : aucune requête', async () => {
    const http = fakeHttp(ok);
    expect((await searchBooks('   ', http)).candidates).toEqual([]);
    expect(http.calls).toEqual([]);
  });
});

describe('détails avant ajout', () => {
  it('notice BnF : couverture du MÊME ISBN vérifiée avant d’être proposée', async () => {
    const withCover = await enrichCandidate(candidate({ isbn: fakeIsbn(1) }), fakeHttp(ok));
    expect(withCover.coverUrl).toContain(fakeIsbn(1));
    const without = await enrichCandidate(candidate({ isbn: fakeIsbn(4) }), fakeHttp(ok));
    expect(without.coverUrl).toBeNull();
    expect(without.warnings).toContain('Pas de couverture trouvée pour cette édition');
  });

  it('Open Library : l’édition imprimée exacte remplace pages, ISBN et couverture', async () => {
    const editions = JSON.stringify({
      entries: [{ key: '/books/OL9M', title: 'Saga, Vol. 1', physical_format: 'Paperback', isbn_13: [fakeIsbn(5)], number_of_pages: 222, covers: [55], languages: [{ key: '/languages/eng' }] }],
    });
    const c = candidate({ source: 'openlibrary', sources: ['openlibrary'], olWorkKey: '/works/OL1W', language: 'eng', isbn: fakeIsbn(3), pageCount: null });
    const e = await enrichCandidate(c, fakeHttp(() => editions));
    expect(e).toMatchObject({ isbn: fakeIsbn(5), pageCount: 222, coverUrl: 'https://covers.openlibrary.org/b/id/55-L.jpg', enriched: true });
  });

  it('Open Library injoignable : résultat d’origine gardé, avec un avertissement', async () => {
    const c = candidate({ source: 'openlibrary', sources: ['openlibrary'], olWorkKey: '/works/OL1W' });
    const e = await enrichCandidate(c, fakeHttp(() => new HttpError('offline')));
    expect(e.isbn).toBe(c.isbn);
    expect(e.warnings).toContain('Détails de l’édition non récupérés (réseau)');
  });
});

describe('client HTTP', () => {
  const res = (status: number, body = '') => ({ ok: status >= 200 && status < 300, status, text: async () => body });

  it('codes HTTP traduits en erreurs typées', async () => {
    await expect(createHttpClient(async () => res(429)).getText('u')).rejects.toMatchObject({ kind: 'rate_limited' });
    await expect(createHttpClient(async () => res(503)).getText('u')).rejects.toMatchObject({ kind: 'http', status: 503 });
    await expect(createHttpClient(async () => res(200, 'ok')).getText('u')).resolves.toBe('ok');
  });

  it('erreur réseau → hors ligne ; délai dépassé → timeout', async () => {
    await expect(
      createHttpClient(async () => {
        throw new TypeError('Network request failed');
      }).getText('u'),
    ).rejects.toMatchObject({ kind: 'offline' });
    const hanging: FetchLike = (_u, init) =>
      new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    await expect(createHttpClient(hanging).getText('u', { timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('annulation par l’utilisateur', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(createHttpClient(async () => res(200)).getText('u', { signal: ctrl.signal })).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('identifie l’application sans aucune donnée personnelle', async () => {
    let headers: Record<string, string> | undefined;
    await createHttpClient(async (_u, init) => {
      headers = init?.headers;
      return res(200);
    }).getText('u');
    expect(headers?.['User-Agent']).toMatch(/^LectureSucree\//);
    expect(headers?.['User-Agent']).not.toMatch(/@/);
  });

  it('messages affichables', () => {
    expect(describeHttpError(new HttpError('offline'))).toBe('Pas de connexion');
    expect(describeHttpError(new Error('x'))).toBe('Réponse illisible');
  });
});
