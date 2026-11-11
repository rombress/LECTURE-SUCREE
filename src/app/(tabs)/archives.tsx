import { useCallback } from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SessionRow } from '@/components/SessionRow';
import { EmptyState } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { listRecentSessions } from '@/data/repositories/sessions';
import { useFocusLoad } from '@/features/library/useFocusLoad';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

/** MVP : historique de toutes les sessions. Recherche et filtres : lot « Archives ». */
export default function ArchivesScreen() {
  const db = useDb();
  const { colors, fonts } = useTheme();
  const load = useCallback(() => listRecentSessions(db), [db]);
  const { data: sessions, failed } = useFocusLoad(load);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={sessions ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={[styles.title, { color: colors.textPrimary, fontFamily: fonts.serif }]}>Sessions</Text>
        }
        ListEmptyComponent={
          failed ? (
            <EmptyState title="Erreur de lecture" text="L’historique n’a pas pu être chargé." />
          ) : sessions ? (
            <EmptyState title="Aucune session" text="Vos sessions enregistrées apparaîtront ici, de la plus récente à la plus ancienne." />
          ) : undefined
        }
        renderItem={({ item }) => <SessionRow session={item} showVolume />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  title: { fontSize: 32, fontWeight: '700', marginBottom: spacing.sm },
});
