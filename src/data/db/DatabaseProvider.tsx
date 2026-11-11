import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { sweepTrash } from '@/features/deletion/deletion';
import { deviceTrashOps } from '@/features/deletion/deviceTrash';
import { deviceAudioOps } from '@/features/recording/audioStore';
import { recoverUnfinishedSessions } from '@/features/recording/recovery';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

import { getDatabase } from './database';
import type { DbLike } from './types';

const DbContext = createContext<DbLike | null>(null);

/**
 * Ouvre la base (migrations), récupère les sessions interrompues, puis
 * affiche l'app. En cas d'échec : écran d'erreur explicite, aucune donnée
 * modifiée.
 */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [db, setDb] = useState<DbLike | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const opened = await getDatabase();
      // 1. Répare une suppression interrompue (corbeille), 2. récupère les enregistrements interrompus.
      await sweepTrash(opened, deviceTrashOps).catch(() => log.error('app.trash_sweep_failed'));
      await recoverUnfinishedSessions(opened, deviceAudioOps, new Date().toISOString());
      if (!cancelled) setDb(opened);
    })().catch((e: unknown) => {
      log.error('app.db_init_failed', { kind: e instanceof Error ? e.name : 'unknown' });
      if (!cancelled) setFailed(e instanceof Error ? `${e.name}: ${e.message}` : 'erreur inconnue');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>La bibliothèque n’a pas pu s’ouvrir</Text>
        <Text selectable style={{ color: colors.textSecondary, textAlign: 'center' }}>
          {failed}
        </Text>
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: spacing.md }}>
          Aucune donnée n’a été modifiée. Fermez puis rouvrez l’app ; si le problème persiste, notez ce message.
        </Text>
      </View>
    );
  }
  if (!db) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): DbLike {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb doit être utilisé dans <DatabaseProvider>');
  return db;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
});
