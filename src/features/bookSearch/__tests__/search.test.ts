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
    async probeImage(url, opts) {
      calls.push(`${opts?.method ?? 'HEAD'} ${url}`);
      if (url.includes('openapi.bnf.fr')) return url.includes('cbAVEC') ? 'found' : url.includes('cbRESEAU') ? 'unreachable' : 'missing';
      return url.includes(fakeIsbn(1)) ? 'found' : 'missing';
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

describe('couvertures BnF (service Couvertures, par ark)', () => {
  it('couverture trouvée sur la notice : prioritaire, grande taille, source BnF', async () => {
    const http = fakeHttp(ok);
    const e = await enrichCandidate(candidate({ bnfArk: 'ark:/12148/cbAVEC', isbn: fakeIsbn(1) }), http);
    expect(e.coverSource).toBe('bnf');
    expect(e.coverUrl).toBe('https://openapi.bnf.fr/couverture/image/image/recupererImage?idArk=ark:/12148/cbAVEC&couverture=1&taille=originale&largeur=900&hauteur=1350');
    // Test d'existence en GET (la BnF refuse HEAD) ; Open Library non sollicité.
    expect(http.calls).toEqual(['GET https://openapi.bnf.fr/couverture/image/image/recupererImage?idArk=ark:/12148/cbAVEC&couverture=1']);
  });

  it('HTTP 500 (notice sans couverture) : pas une panne, repli sur Open Library avec le MÊME ISBN', async () => {
    const e = await enrichCandidate(candidate({ bnfArk: 'ark:/12148/cbSANS', isbn: fakeIsbn(1) }), fakeHttp(ok));
    expect(e).toMatchObject({ coverSource: 'openlibrary', coverUrl: expect.stringContaining(fakeIsbn(1)) });
    expect(e.warnings.join(' ')).not.toMatch(/réseau/);
  });

  it('aucune couverture nulle part : signalé, rien d’emprunté à une autre édition', async () => {
    const e = await enrichCandidate(candidate({ bnfArk: 'ark:/12148/cbSANS', isbn: fakeIsbn(4) }), fakeHttp(ok));
    expect(e.coverUrl).toBeNull();
    expect(e.coverSource).toBeNull();
    expect(e.warnings).toContain('Pas de couverture trouvée pour cette édition');
  });

  it('BnF injoignable : avertissement « non vérifiée (réseau) »', async () => {
    const e = await enrichCandidate(candidate({ bnfArk: 'ark:/12148/cbRESEAU', isbn: fakeIsbn(4) }), fakeHttp(ok));
    expect(e.warnings).toContain('Couverture BnF non vérifiée (réseau)');
  });

  it('notice déjà illustrée par Open Library (même ISBN) : la couverture BnF reste prioritaire si elle existe', async () => {
    const c = candidate({ bnfArk: 'ark:/12148/cbAVEC', coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg', coverSource: 'openlibrary' });
    expect((await enrichCandidate(c, fakeHttp(ok))).coverSource).toBe('bnf');
    const sans = candidate({ bnfArk: 'ark:/12148/cbSANS', coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg', coverSource: 'openlibrary' });
    expect(await enrichCandidate(sans, fakeHttp(ok))).toMatchObject({ coverSource: 'openlibrary', coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg' });
  });
});

describe('détails avant ajout', () => {
  it('notice sans ark : couverture du MÊME ISBN vérifiée avant d’être proposée', async () => {
    const withCover = await enrichCandidate(candidate({ isbn: fakeIsbn(1) }), fakeHttp(ok));
    expect(withCover.coverUrl).toContain(fakeIsbn(1));
    const without = await enrichCandidate(candidate({ isbn: fakeIsbn(4) }), fakeHttp(ok));
    expect(without.coverUrl).toBeNull();
    expect(without.warnings).toContain('Pas de couverture trouvée pour cette édition');
  });

  it('Open Library : l’édition imprimée exacte remplace pages, ISBN et couverture', async () => {
    const editions = JSON.stringify({
      entries: [
        // L'édition affichée (ebook) + l'imprimée de la même langue.
        { key: '/books/OL8M', title: 'Saga, Vol. 1', physical_format: 'ebook', isbn_13: [fakeIsbn(3)], languages: [{ key: '/languages/eng' }] },
        { key: '/books/OL9M', title: 'Saga, Vol. 1', physical_format: 'Paperback', isbn_13: [fakeIsbn(5)], number_of_pages: 222, covers: [55], languages: [{ key: '/languages/eng' }] },
      ],
    });
    const c = candidate({ source: 'openlibrary', sources: ['openlibrary'], olWorkKey: '/works/OL1W', language: 'eng', isbn: fakeIsbn(3), pageCount: null });
    const e = await enrichCandidate(c, fakeHttp(() => editions));
    expect(e).toMatchObject({ isbn: fakeIsbn(5), pageCount: 222, coverUrl: 'https://covers.openlibrary.org/b/id/55-L.jpg', enriched: true });
    expect(e.warnings.join(' ')).toMatch(/ISBN différent/);
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

  it('test d’image : 500 → absente, erreur réseau → injoignable, image → trouvée', async () => {
    const img = { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, text: async () => '' };
    expect(await createHttpClient(async () => img).probeImage('u', { method: 'GET' })).toBe('found');
    expect(await createHttpClient(async () => res(500)).probeImage('u')).toBe('missing');
    expect(await createHttpClient(async () => ({ ...img, headers: { get: () => 'text/html' } })).probeImage('u')).toBe('missing');
    expect(
      await createHttpClient(async () => {
        throw new TypeError('Network request failed');
      }).probeImage('u'),
    ).toBe('unreachable');
  });

  it('messages affichables', () => {
    expect(describeHttpError(new HttpError('offline'))).toBe('Pas de connexion');
    expect(describeHttpError(new Error('x'))).toBe('Réponse illisible');
  });
});
