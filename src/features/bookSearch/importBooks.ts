/**
 * Ajout d'éditions trouvées à la bibliothèque.
 *
 * Sécurité des données existantes :
 * - on n'écrit QUE des lignes nouvelles (INSERT) : aucun livre, série,
 *   audio ou transcription existant n'est modifié ;
 * - toutes les écritures en base d'un ajout groupé sont faites dans UNE
 *   transaction (tout ou rien) ;
 * - les couvertures sont téléchargées AVANT la transaction ; si l'écriture
 *   échoue, les fichiers copiés sont supprimés (aucun orphelin) ;
 * - un doublon (même ISBN, ou même titre et même numéro) n'est jamais
 *   ajouté : il est compté et signalé.
 */
import type { DbLike } from '@/data/db/types';
import { createSeries } from '@/data/repositories/series';
import { createVolume, type VolumeFormInput } from '@/data/repositories/volumes';
import { validateVolume } from '@/domain/validation';

import { findDuplicate, loadExistingKeys } from './duplicates';
import { normalizeForMatch } from './text';
import { coverCredit, type BookCandidate } from './types';

export interface CoverOps {
  /** Télécharge et normalise ; retourne une URI en attente (cache). */
  download(url: string): Promise<string>;
  /** Copie dans le stockage privé ; retourne le chemin relatif. */
  persist(pendingUri: string, ownerId: string): Promise<string>;
  /** Supprime une copie privée (nettoyage après échec). */
  discard(relPath: string): void;
  /** Supprime l'image temporaire (cache) une fois copiée ou abandonnée. */
  discardPending?(pendingUri: string): void;
}

export type SeriesChoice =
  | { kind: 'none' }
  | { kind: 'existing'; seriesId: string }
  | { kind: 'new'; title: string; author: string | null };

export interface BatchImportRequest {
  items: BookCandidate[];
  series: SeriesChoice;
  /** Auteur appliqué à tous les tomes (corrige un nom en écriture japonaise, par exemple). */
  author: string;
  newId: () => string;
  nowIso: string;
}

export interface BatchImportReport {
  added: { id: string; title: string; volumeLabel: string | null }[];
  skippedDuplicates: { title: string; volumeLabel: string | null }[];
  /** Fiches refusées par la validation (ex. titre trop long) : écartées AVANT l'écriture. */
  skippedInvalid: { title: string; volumeLabel: string | null }[];
  coverFailures: number;
  seriesId: string | null;
}

/** Fiche à enregistrer pour une édition (rien n'est inventé : champs absents = null). */
export function candidateToInput(c: BookCandidate, author: string, seriesId: string | null): VolumeFormInput {
  return {
    title: c.title,
    author,
    volumeLabel: c.volume?.label ?? null,
    pageCount: c.pageCount,
    currentPage: 0,
    status: 'to_read',
    description: c.description,
    seriesId,
    isbn: c.isbn,
    publisher: c.publisher,
    language: c.language,
    sourceRef: c.sourceRef,
  };
}

/** Ordre de lecture : numéro croissant, puis titre (les tomes sans numéro à la fin). */
export function sortForImport(items: readonly BookCandidate[]): BookCandidate[] {
  return [...items].sort((a, b) => {
    const na = a.volume?.number ?? Number.POSITIVE_INFINITY;
    const nb = b.volume?.number ?? Number.POSITIVE_INFINITY;
    return na !== nb ? na - nb : a.title.localeCompare(b.title, 'fr');
  });
}

export async function importBatch(db: DbLike, req: BatchImportRequest, covers: CoverOps): Promise<BatchImportReport> {
  const author = req.author.trim();
  if (!author) throw new Error('auteur obligatoire');
  const existing = await loadExistingKeys(db);
  const targetSeries = req.series.kind === 'existing' ? req.series.seriesId : null;

  const toAdd: { id: string; c: BookCandidate }[] = [];
  const skippedDuplicates: BatchImportReport['skippedDuplicates'] = [];
  const skippedInvalid: BatchImportReport['skippedInvalid'] = [];
  const seenIsbn = new Set<string>();
  // Sélection revérifiée APRÈS la relecture des éditions : même série, même
  // tome et même langue sous deux éditions différentes (broché et relié, deux
  // fiches Open Library…) → un seul est ajouté.
  const acceptedVolumes = new Set<string>();
  const volumeKey = (c: BookCandidate) => `${c.language ?? '?'}|${normalizeForMatch(c.seriesTitle)}|${normalizeForMatch(c.volume?.label)}`;
  const sameVolumeInSelection = (c: BookCandidate) => c.volume?.number != null && acceptedVolumes.has(volumeKey(c));
  for (const c of sortForImport(req.items)) {
    if (findDuplicate(c, existing, targetSeries) || (c.isbn && seenIsbn.has(c.isbn)) || sameVolumeInSelection(c)) {
      skippedDuplicates.push({ title: c.title, volumeLabel: c.volume?.label ?? null });
      continue;
    }
    if (!validateVolume(candidateToInput(c, author, null)).ok) {
      skippedInvalid.push({ title: c.title, volumeLabel: c.volume?.label ?? null });
      continue;
    }
    if (c.isbn) seenIsbn.add(c.isbn);
    const id = req.newId();
    toAdd.push({ id, c });
    if (c.volume?.number != null) acceptedVolumes.add(volumeKey(c));
  }

  // 1. Couvertures (hors transaction : réseau). Un échec n'empêche pas l'ajout.
  const coverPaths = new Map<string, string>();
  let coverFailures = 0;
  for (const { id, c } of toAdd) {
    if (!c.coverUrl) continue;
    let pending: string | null = null;
    try {
      pending = await covers.download(c.coverUrl);
      coverPaths.set(id, await covers.persist(pending, id));
    } catch {
      coverFailures++;
    } finally {
      if (pending) covers.discardPending?.(pending);
    }
  }

  // 2. Base : tout ou rien.
  let seriesId: string | null = targetSeries;
  const added: BatchImportReport['added'] = [];
  try {
    await db.withTransactionAsync(async () => {
      if (req.series.kind === 'new') {
        const s = await createSeries(db, req.newId(), { title: req.series.title, author: req.series.author }, req.nowIso);
        seriesId = s.id;
      }
      for (const { id, c } of toAdd) {
        const coverPath = coverPaths.get(id) ?? null;
        const credit = coverPath && c.coverSource ? coverCredit(c.coverSource, new Date(req.nowIso)) : null;
        const v = await createVolume(db, id, { ...candidateToInput(c, author, seriesId), coverPath, coverCredit: credit }, req.nowIso);
        added.push({ id: v.id, title: v.title, volumeLabel: v.volumeLabel });
      }
    });
  } catch (e) {
    for (const rel of coverPaths.values()) covers.discard(rel);
    throw e;
  }
  return { added, skippedDuplicates, skippedInvalid, coverFailures, seriesId };
}
