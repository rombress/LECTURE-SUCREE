/**
 * Sous-ensemble de l'API expo-sqlite utilisé par les dépôts. Le type
 * `SQLiteDatabase` d'expo-sqlite le satisfait. Dans les tests, il est
 * implémenté par node:sqlite, ce qui exécute le VRAI SQL des dépôts.
 */
export type SqlParam = string | number | null;

export interface DbLike {
  getAllAsync<T>(sql: string, params: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlParam[]): Promise<T | null>;
  runAsync(sql: string, params: SqlParam[]): Promise<{ changes: number }>;
  /** Transaction : tout ou rien (expo-sqlite : withTransactionAsync). */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
