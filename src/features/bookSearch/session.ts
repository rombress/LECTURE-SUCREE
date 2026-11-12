/**
 * Résultats de la dernière recherche, gardés en mémoire le temps du
 * parcours (écran de recherche → fiche d'une édition / ajout groupé).
 * Rien n'est écrit sur l'appareil tant que l'utilisateur n'a pas confirmé.
 */
import { createHttpClient, type FetchLike, type HttpClient } from './http';
import type { BookCandidate } from './types';

const byId = new Map<string, BookCandidate>();
let selection: string[] = [];

export const searchSession = {
  remember(list: readonly BookCandidate[]) {
    byId.clear();
    list.forEach((c) => byId.set(c.id, c));
  },
  get(id: string): BookCandidate | undefined {
    return byId.get(id);
  },
  update(c: BookCandidate) {
    byId.set(c.id, c);
  },
  setSelection(ids: readonly string[]) {
    selection = [...ids];
  },
  selection(): BookCandidate[] {
    return selection.map((id) => byId.get(id)).filter((c): c is BookCandidate => !!c);
  },
};

let client: HttpClient | null = null;
/** Client réseau de l'application (fetch de React Native). */
export function appHttp(): HttpClient {
  client ??= createHttpClient(fetch as unknown as FetchLike);
  return client;
}
