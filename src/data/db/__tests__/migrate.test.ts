import { assertMigrationsWellFormed, migrate, MigrationError, type SqlExecutor } from '../migrate';
import { LATEST_SCHEMA_VERSION, MIGRATIONS, type Migration } from '../migrations';

/** Doublure d'exécuteur : simule user_version et l'annulation de transaction. */
function fakeDb(initialVersion = 0, failOn?: string) {
  let version = initialVersion;
  const executed: string[] = [];
  const db: SqlExecutor = {
    getUserVersion: async () => version,
    setUserVersion: async (v) => {
      version = v;
    },
    exec: async (sql) => {
      if (failOn && sql.includes(failOn)) throw new Error('boom');
      executed.push(sql);
    },
    transaction: async (fn) => {
      const snapshot = { version, n: executed.length };
      try {
        await fn();
      } catch (e) {
        version = snapshot.version;
        executed.length = snapshot.n;
        throw e;
      }
    },
  };
  return { db, executed, getVersion: () => version };
}

const M: Migration[] = [
  { version: 1, name: 'a', sql: 'SQL-1' },
  { version: 2, name: 'b', sql: 'SQL-2' },
  { version: 3, name: 'c', sql: 'SQL-3' },
];

describe('migrate', () => {
  it('applique toutes les migrations sur une base neuve', async () => {
    const { db, executed } = fakeDb(0);
    const r = await migrate(db, M);
    expect(r).toEqual({ from: 0, to: 3, applied: [1, 2, 3] });
    expect(executed).toEqual(['SQL-1', 'SQL-2', 'SQL-3']);
  });

  it('n’applique que les migrations manquantes (idempotent)', async () => {
    const { db, executed } = fakeDb(2);
    const r = await migrate(db, M);
    expect(r.applied).toEqual([3]);
    expect(executed).toEqual(['SQL-3']);
    const again = await migrate(db, M);
    expect(again.applied).toEqual([]);
  });

  it('s’arrête et annule la migration en échec, sans toucher aux précédentes', async () => {
    const { db, getVersion } = fakeDb(0, 'SQL-2');
    await expect(migrate(db, M)).rejects.toBeInstanceOf(MigrationError);
    expect(getVersion()).toBe(1);
  });

  it('refuse une base plus récente que l’app', async () => {
    const { db } = fakeDb(9);
    await expect(migrate(db, M)).rejects.toThrow(/plus récente/);
  });

  it('refuse des migrations non contiguës', () => {
    expect(() => assertMigrationsWellFormed([{ version: 2, name: 'x', sql: '' }])).toThrow();
  });

  it('les migrations réelles sont bien formées', () => {
    expect(() => assertMigrationsWellFormed(MIGRATIONS)).not.toThrow();
    expect(LATEST_SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });
});
