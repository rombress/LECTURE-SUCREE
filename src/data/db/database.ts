import * as SQLite from 'expo-sqlite';

import { log } from '@/services/log';

import { migrate, type MigrationReport, type SqlExecutor } from './migrate';
import { MIGRATIONS } from './migrations';

/**
 * Base locale UNIQUE de l'application, dans le stockage privé de l'app
 * (iOS : Library/…/SQLite du bac à sable ; Android : /data/data/<pkg>/files/SQLite).
 * Jamais dans un dossier partagé, jamais dans le dépôt.
 */
export const DATABASE_NAME = 'lecture-sucree.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let lastReport: MigrationReport | null = null;

/**
 * Exécuteur de migrations. Dans `withExclusiveTransactionAsync`, la doc
 * expo-sqlite exige que TOUTES les requêtes passent par l'objet `txn` :
 * on route donc exec / user_version vers la connexion de transaction active.
 */
function executorFor(db: SQLite.SQLiteDatabase): SqlExecutor {
  let current: SQLite.SQLiteDatabase = db;
  return {
    async getUserVersion() {
      const row = await current.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      return row?.user_version ?? 0;
    },
    async setUserVersion(v: number) {
      if (!Number.isInteger(v) || v < 0) throw new Error('version invalide');
      await current.execAsync(`PRAGMA user_version = ${v}`);
    },
    async transaction(fn) {
      await db.withExclusiveTransactionAsync(async (txn) => {
        current = txn;
        try {
          await fn();
        } finally {
          current = db;
        }
      });
    },
    async exec(sql) {
      await current.execAsync(sql);
    },
  };
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  // WAL : écritures fréquentes (segments de transcription) sans bloquer la lecture.
  // foreign_keys : indispensable aux garanties ON DELETE SET NULL / RESTRICT.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');
  lastReport = await migrate(executorFor(db), MIGRATIONS);
  log.info('db.ready', { from: lastReport.from, to: lastReport.to, applied: lastReport.applied.length });
  return db;
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((e: unknown) => {
      dbPromise = null;
      log.error('db.open_failed', { kind: e instanceof Error ? e.name : 'unknown' });
      throw e;
    });
  }
  return dbPromise;
}

export function getLastMigrationReport(): MigrationReport | null {
  return lastReport;
}
