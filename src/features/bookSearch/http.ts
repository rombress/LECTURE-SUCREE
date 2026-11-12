/**
 * Accès réseau des recherches : délai maximal, annulation, erreurs typées.
 * `fetch` est injecté pour que la logique soit testable sans réseau.
 */

export type FetchLike = (
  url: string,
  init?: { method?: 'GET' | 'HEAD'; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export type HttpErrorKind = 'offline' | 'timeout' | 'http' | 'rate_limited' | 'cancelled' | 'invalid';

export class HttpError extends Error {
  constructor(
    public readonly kind: HttpErrorKind,
    public readonly status?: number,
  ) {
    super(`http:${kind}${status ? `:${status}` : ''}`);
    this.name = 'HttpError';
  }
}

/**
 * Identifie l'application auprès des catalogues (demandé par Open Library).
 * Volontairement SANS adresse e-mail : aucune donnée personnelle envoyée.
 */
export const USER_AGENT = 'LectureSucree/0.4 (application de lecture personnelle, iOS)';

export interface HttpClient {
  getText(url: string, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<string>;
  /** L'URL désigne-t-elle une image existante ? (requête HEAD, redirections suivies) */
  imageExists(url: string, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<boolean>;
}

export function createHttpClient(fetchImpl: FetchLike): HttpClient {
  return {
    async imageExists(url, opts = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10000);
      const onCancel = () => controller.abort();
      opts.signal?.addEventListener('abort', onCancel);
      try {
        const res = await fetchImpl(url, { method: 'HEAD', headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
        const type = res.headers?.get('content-type') ?? '';
        return res.ok && (type === '' || type.startsWith('image/'));
      } catch {
        if (opts.signal?.aborted) throw new HttpError('cancelled');
        return false;
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onCancel);
      }
    },
    async getText(url, opts = {}) {
      const controller = new AbortController();
      const timeoutMs = opts.timeoutMs ?? 15000;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const onCancel = () => controller.abort();
      opts.signal?.addEventListener('abort', onCancel);
      try {
        if (opts.signal?.aborted) throw new HttpError('cancelled');
        const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' }, signal: controller.signal });
        if (res.status === 429 || res.status === 403) throw new HttpError('rate_limited', res.status);
        if (!res.ok) throw new HttpError('http', res.status);
        return await res.text();
      } catch (e) {
        if (e instanceof HttpError) throw e;
        if (opts.signal?.aborted) throw new HttpError('cancelled');
        if (timedOut) throw new HttpError('timeout');
        throw new HttpError('offline');
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onCancel);
      }
    },
  };
}

/** Message affichable (aucun détail technique). */
export function describeHttpError(e: unknown): string {
  if (!(e instanceof HttpError)) return 'Réponse illisible';
  switch (e.kind) {
    case 'offline':
      return 'Pas de connexion';
    case 'timeout':
      return 'Délai dépassé';
    case 'rate_limited':
      return 'Trop de requêtes, réessayez dans quelques minutes';
    case 'cancelled':
      return 'Annulé';
    case 'http':
      return `Service indisponible (${e.status ?? '?'})`;
    default:
      return 'Réponse illisible';
  }
}
