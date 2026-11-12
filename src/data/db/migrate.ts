import type { Migration } from './migrations';

/**
 * Exécuteur minimal, implémenté par expo-sqlite dans l'app et par une
 * doublure dans les tests. Permet de tester la logique de migration sans
 * appareil.
 */
export interface SqlExecutor {
  getUserVersion(): Promise<number>;
  setUserVersion(v: number): Promise<void>;
  /** Exécute `fn` dans une transaction ; annule tout si `fn` lève une erreur. */
  transaction(fn: () => Promise<void>): Promise<void>;
  exec(sql: string): Promise<void>;
}

export class MigrationError extends Error {
  // Champ explicite (pas de « parameter property ») : ce fichier est aussi
  // exécuté tel quel par Node dans tests/node/migration.test.mjs.
  public readonly version: number;
  constructor(version: number, cause: unknown) {
    super(`Migration ${version} échouée`);
    this.version = version;
    this.name = 'MigrationError';
    this.cause = cause;
  }
}

export interface MigrationReport {
  from: number;
  to: number;
  applied: number[];
}

/** Vérifie que les migrations sont strictement croissantes et contiguës (1, 2, 3…). */
export function assertMigrationsWellFormed(migrations: readonly Migration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Migrations mal ordonnées : attendu ${i + 1}, trouvé ${m.version}`);
    }
  });
}

export async function migrate(db: SqlExecutor, migrations: readonly Migration[]): Promise<MigrationReport> {
  assertMigrationsWellFormed(migrations);
  const from = await db.getUserVersion();
  const latest = migrations.length;
  if (from > latest) {
    // Base créée par une version plus récente de l'app : on refuse d'y toucher.
    throw new Error(`Base en version ${from}, plus récente que l'app (${latest}). Mettez l'app à jour.`);
  }
  const applied: number[] = [];
  for (const m of migrations) {
    if (m.version <= from) continue;
    try {
      await db.transaction(async () => {
        await db.exec(m.sql);
        await db.setUserVersion(m.version);
      });
    } catch (e) {
      throw new MigrationError(m.version, e);
    }
    applied.push(m.version);
  }
  return { from, to: await db.getUserVersion(), applied };
}
