/**
 * Journalisation SANS contenu personnel.
 *
 * - Un événement est un code technique (`db.ready`, `audio.start_failed`…).
 * - Les métadonnées n'acceptent que des nombres, booléens, null, et des
 *   chaînes « code » courtes ([a-z0-9_.-], 40 caractères max). Toute autre
 *   chaîne (titre de livre, transcription, chemin, e-mail…) est remplacée par
 *   « [masqué] ». On ne peut donc pas journaliser une donnée personnelle par
 *   inadvertance.
 * - En production, seuls warn/error sont émis (console système de l'appareil,
 *   jamais envoyés à un service externe).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogValue = number | boolean | null | string;
export type LogMeta = Record<string, LogValue>;

const EVENT = /^[a-z][a-z0-9_.-]{0,60}$/;
const CODE = /^[a-z0-9_.-]{1,40}$/i;
export const REDACTED = '[masqué]';

export function sanitizeMeta(meta: LogMeta | undefined): Record<string, number | boolean | null | string> {
  const out: Record<string, number | boolean | null | string> = {};
  if (!meta) return out;
  for (const [k, v] of Object.entries(meta)) {
    if (!CODE.test(k)) continue;
    if (v === null || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'number') out[k] = Number.isFinite(v) ? v : null;
    else if (typeof v === 'string' && CODE.test(v)) out[k] = v;
    else out[k] = REDACTED;
  }
  return out;
}

export function formatLog(level: LogLevel, event: string, meta?: LogMeta): string {
  const safeEvent = EVENT.test(event) ? event : 'invalid_event';
  const m = sanitizeMeta(meta);
  const tail = Object.keys(m).length ? ' ' + JSON.stringify(m) : '';
  return `[lecture-sucree] ${level.toUpperCase()} ${safeEvent}${tail}`;
}

type Sink = (level: LogLevel, line: string) => void;

const consoleSink: Sink = (level, line) => {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

let sink: Sink = consoleSink;
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

function emit(level: LogLevel, event: string, meta?: LogMeta) {
  if (!isDev && (level === 'debug' || level === 'info')) return;
  sink(level, formatLog(level, event, meta));
}

export const log = {
  debug: (event: string, meta?: LogMeta) => emit('debug', event, meta),
  info: (event: string, meta?: LogMeta) => emit('info', event, meta),
  warn: (event: string, meta?: LogMeta) => emit('warn', event, meta),
  error: (event: string, meta?: LogMeta) => emit('error', event, meta),
};

/** Tests uniquement. */
export function __setLogSink(s: Sink | null) {
  sink = s ?? consoleSink;
}
