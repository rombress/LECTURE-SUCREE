/**
 * Diagnostic technique (lot 0) : vérifie SUR L'APPAREIL que les briques
 * natives nécessaires à Lecture sucrée sont présentes et fonctionnent,
 * notamment dans un build signé par AltServer (compte Apple gratuit).
 *
 * Aucune donnée personnelle n'est lue ni affichée. Aucune permission n'est
 * demandée automatiquement : seulement lue (les demandes sont des boutons).
 */
import { getRecordingPermissionsAsync } from 'expo-audio';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';

import { getDatabase, getLastMigrationReport } from '@/data/db/database';
import { LATEST_SCHEMA_VERSION } from '@/data/db/migrations';
import { APP_DIR } from '@/data/files/paths';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info';
export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

const LOCALE = 'fr-FR';

async function safe(id: string, label: string, fn: () => Promise<Omit<CheckResult, 'id' | 'label'>>): Promise<CheckResult> {
  try {
    return { id, label, ...(await fn()) };
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : 'erreur inconnue';
    return { id, label, status: 'fail', detail: msg.slice(0, 200) };
  }
}

export async function runDiagnostics(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(
    await safe('app', 'Application', async () => ({
      status: 'info',
      detail: `${Constants.expoConfig?.name ?? '?'} ${Constants.expoConfig?.version ?? '?'} — ${Platform.OS} ${String(Platform.Version)}`,
    })),
  );

  results.push(
    await safe('sqlite', 'SQLite + migrations', async () => {
      const db = await getDatabase();
      const v = await db.getFirstAsync<{ v: string }>('SELECT sqlite_version() AS v');
      const fk = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
      const jm = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
      const uv = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      const report = getLastMigrationReport();
      const okVersion = uv?.user_version === LATEST_SCHEMA_VERSION;
      const okFk = fk?.foreign_keys === 1;
      return {
        status: okVersion && okFk ? 'ok' : 'fail',
        detail: `SQLite ${v?.v ?? '?'} · schéma v${uv?.user_version ?? '?'}/${LATEST_SCHEMA_VERSION} · clés étrangères ${okFk ? 'actives' : 'INACTIVES'} · journal ${jm?.journal_mode ?? '?'} · migrations appliquées à ce lancement : ${report?.applied.length ?? 0}`,
      };
    }),
  );

  results.push(
    await safe('fts5', 'Recherche plein texte (FTS5, sans accents)', async () => {
      const db = await getDatabase();
      // Table temporaire : n'écrit rien dans les vraies données.
      await db.execAsync(
        "CREATE VIRTUAL TABLE IF NOT EXISTS temp.diag_fts USING fts5(t, tokenize='unicode61 remove_diacritics 2'); DELETE FROM temp.diag_fts; INSERT INTO temp.diag_fts(t) VALUES ('Théorie élégante');",
      );
      // Le membre gauche de MATCH doit être le nom de table NON qualifié
      // (« temp.diag_fts MATCH » échoue : vérifié avec node:sqlite).
      const row = await db.getFirstAsync<{ n: number }>("SELECT count(*) AS n FROM temp.diag_fts WHERE diag_fts MATCH 'theorie'");
      await db.execAsync('DROP TABLE IF EXISTS temp.diag_fts;');
      return row?.n === 1
        ? { status: 'ok', detail: '« theorie » trouve « Théorie »' }
        : { status: 'fail', detail: 'FTS5 présent mais résultat inattendu' };
    }),
  );

  results.push(
    await safe('files', 'Stockage privé (écriture / lecture / suppression)', async () => {
      const root = new Directory(Paths.document, APP_DIR);
      if (!root.exists) root.create({ intermediates: true });
      const probe = new File(root, '.diagnostic-probe.txt');
      const payload = `probe-${Date.now()}`;
      await probe.write(payload); // write() est asynchrone dans le SDK 58
      const back = await probe.text();
      probe.delete();
      return back === payload
        ? { status: 'ok', detail: 'Dossier privé de l’app accessible en écriture' }
        : { status: 'fail', detail: 'Relecture différente de l’écriture' };
    }),
  );

  results.push(
    await safe('mic', 'Permission micro (lecture seule)', async () => {
      const p = await getRecordingPermissionsAsync();
      return { status: p.granted ? 'ok' : 'info', detail: `état : ${p.status}${p.canAskAgain ? '' : ' (ne peut plus être redemandée : Réglages)'}` };
    }),
  );

  results.push(
    await safe('speech', 'Reconnaissance vocale native', async () => {
      const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      const onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
      const recording = ExpoSpeechRecognitionModule.supportsRecording();
      const perm = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      return {
        status: available ? (onDevice ? 'ok' : 'warn') : 'fail',
        detail: `disponible : ${available ? 'oui' : 'non'} · sur l’appareil : ${onDevice ? 'oui' : 'non'} · conservation audio : ${recording ? 'oui' : 'non'} · permission : ${perm.status}`,
      };
    }),
  );

  results.push(
    await safe('locales', `Langue ${LOCALE} pour la reconnaissance`, async () => {
      const { locales, installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales(
        Platform.OS === 'android' ? { androidRecognitionServicePackage: 'com.google.android.as' } : {},
      );
      const norm = (l: string) => l.replace('_', '-').toLowerCase();
      const supported = locales.some((l) => norm(l).startsWith('fr'));
      const installed = installedLocales.some((l) => norm(l).startsWith('fr'));
      return {
        status: installed ? 'ok' : supported ? 'warn' : 'fail',
        detail: `français pris en charge : ${supported ? 'oui' : 'non'} · installé hors ligne : ${installed ? 'oui' : 'non'} (${locales.length} langues, ${installedLocales.length} hors ligne)`,
      };
    }),
  );

  return results;
}
