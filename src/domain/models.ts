/**
 * Modèle métier de Lecture sucrée (V1).
 *
 * Bibliothèque → Séries → Tomes → Sessions.
 * - Un tome appartient à 0 ou 1 série.
 * - Une session appartient toujours à exactement 1 tome (jamais à une série).
 * - Retirer une série ne supprime ni ses tomes ni leurs sessions
 *   (garanti par la base : ON DELETE SET NULL, voir data/db/migrations.ts).
 * - L'audio original est un fichier séparé, jamais modifié après la fin de
 *   l'enregistrement ; corriger la transcription ne touche pas l'audio.
 */

export type Id = string; // UUID v4
export type IsoDateTime = string; // ISO 8601, UTC (ex. 2026-11-11T10:00:00.000Z)

export const VOLUME_STATUSES = ['to_read', 'reading', 'finished', 'paused', 'abandoned'] as const;
export type VolumeStatus = (typeof VOLUME_STATUSES)[number];

export const VOLUME_STATUS_LABELS: Record<VolumeStatus, string> = {
  to_read: 'À lire',
  reading: 'En cours',
  finished: 'Terminé',
  paused: 'En pause',
  abandoned: 'Abandonné',
};

export const CATEGORIES = [
  { id: 'characters', label: 'Personnages' },
  { id: 'theories', label: 'Théories' },
  { id: 'plot', label: 'Intrigue' },
  { id: 'symbolism', label: 'Symbolisme' },
  { id: 'feelings', label: 'Ressenti' },
  { id: 'quotes', label: 'Citations' },
  { id: 'predictions', label: 'Prédictions' },
  { id: 'inconsistencies', label: 'Incohérences' },
  { id: 'world', label: 'Univers' },
  { id: 'relationships', label: 'Relations' },
  { id: 'writing', label: 'Écriture' },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];

export interface Series {
  id: Id;
  title: string;
  author: string | null;
  description: string | null;
  coverPath: string | null; // chemin RELATIF au dossier privé de l'app
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Volume {
  id: Id;
  seriesId: Id | null;
  title: string; // obligatoire
  author: string; // obligatoire
  volumeLabel: string | null; // ex. « 3 », « Tome 3 », « Hors-série »
  sortIndex: number | null; // ordre dans la série
  pageCount: number | null;
  currentPage: number;
  status: VolumeStatus;
  description: string | null;
  coverPath: string | null;
  /** Édition (schéma v2) : null pour les livres saisis sans ces informations. */
  isbn: string | null; // ISBN-13 normalisé
  publisher: string | null;
  language: string | null; // ISO 639-2 (« fre », « eng »)
  /** Notice d'origine si le livre a été importé (« bnf:ark:/… », « openlibrary:OL…M »). */
  sourceRef: string | null;
  /** Provenance et date d'une couverture importée (schéma v3) ; null pour une image choisie à la main. */
  coverCredit: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Cycle de vie d'une session d'enregistrement. */
export const SESSION_STATES = ['recording', 'paused', 'completed', 'interrupted'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const TRANSCRIPT_STATUSES = ['none', 'partial', 'complete', 'failed'] as const;
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

export interface ReadingSession {
  id: Id;
  volumeId: Id;
  startedAt: IsoDateTime; // automatique
  endedAt: IsoDateTime | null;
  /** Fuseau de l'appareil au démarrage, ex. « +01:00 » (affichage/export). */
  utcOffset: string;
  durationMs: number; // durée enregistrée effective (pauses exclues)
  page: number | null;
  state: SessionState;
  audio: AudioAsset | null;
  /** Texte brut produit par le moteur, jamais réécrit après la fin. */
  transcriptRaw: string;
  /** Texte affiché/exporté ; l'utilisateur peut le corriger. */
  transcriptText: string;
  transcriptStatus: TranscriptStatus;
  transcriptionEngine: string | null; // ex. « ios-speech-ondevice »
  locale: string | null; // ex. « fr-FR »
  categories: CategoryId[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface AudioAsset {
  path: string; // RELATIF au dossier privé (ex. audio/2026/<id>.wav)
  mimeType: string;
  bytes: number;
  sha256: string; // intégrité (exports, sauvegardes)
  durationMs: number;
}
