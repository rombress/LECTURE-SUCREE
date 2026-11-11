/// <reference types="node" />
/**
 * Base SQLite RÉELLE pour les tests Jest (node:sqlite, Node 24), avec le
 * schéma de production. Implémente DbLike comme expo-sqlite.
 */
import { DatabaseSync } from 'node:sqlite';

import type { DbLike, SqlParam } from '@/data/db/types';
import { MIGRATIONS } from '@/data/db/migrations';

export function createTestDb(): DbLike & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) {
    raw.exec('BEGIN');
    raw.exec(m.sql);
    raw.exec(`PRAGMA user_version = ${m.version}`);
    raw.exec('COMMIT');
  }
  return {
    raw,
    async getAllAsync<T>(sql: string, params: SqlParam[]) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlParam[]) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async runAsync(sql: string, params: SqlParam[]) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
