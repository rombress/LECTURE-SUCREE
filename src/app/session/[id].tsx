import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { getSession, type SessionSummary } from '@/data/repositories/sessions';
import { formatDateTime, formatDuration } from '@/domain/time';
import { useFocusLoad } from '@/features/library/useFocusLoad';
import { finalFile } from '@/features/recording/audioStore';
import { shareSessionAudio, type ShareResult } from '@/features/recording/shareAudio';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const { colors, fonts } = useTheme();
  const load = useCallback(() => getSession(db, id), [db, id]);
  const { data: session, failed } = useFocusLoad(load);

  if (failed) return <EmptyState title="Erreur" text="Impossible de charger cette session." />;
  if (!session) return null;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push(`/volume/${session.volumeId}`)}>
        <Text style={[styles.book, { color: colors.textPrimary, fontFamily: fonts.serif }]}>{session.volumeTitle}</Text>
        <Text style={{ color: colors.textSecondary }}>{session.volumeAuthor}</Text>
      </Pressable>
      <View style={[styles.meta, { borderColor: colors.border }]}>
        <Meta label="Date" value={formatDateTime(session.startedAt)} />
        <Meta label="Durée" value={formatDuration(session.durationMs)} />
        {session.page != null ? <Meta label="Page" value={String(session.page)} /> : null}
        {session.state !== 'completed' ? <Meta label="État" value={session.state === 'interrupted' ? 'Interrompue (récupérée)' : 'En cours'} /> : null}
      </View>
      {session.audioPath ? (
        <Player session={session} />
      ) : (
        <Text style={{ color: colors.warning }}>Aucun audio n’a été enregistré pour cette session.</Text>
      )}
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
        La transcription arrivera dans un prochain lot. L’audio original ci-dessus ne sera jamais modifié.
      </Text>
    </ScrollView>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.metaRow}>
      <Text style={{ color: colors.textMuted }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function Player({ session }: { session: SessionSummary }) {
  const { colors } = useTheme();
  const [uri] = useState(() => finalFile(session.audioPath!).uri);
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const [integrity, setIntegrity] = useState<'idle' | 'checking' | 'ok' | 'mismatch' | 'missing'>('idle');
  const [sharing, setSharing] = useState(false);
  const [shareResult, setShareResult] = useState<ShareResult | 'error' | null>(null);

  const share = async () => {
    setSharing(true);
    setShareResult(null);
    try {
      setShareResult(await shareSessionAudio(session));
    } catch (e) {
      log.error('session.share_failed', { kind: e instanceof Error ? e.name : 'unknown' });
      setShareResult('error');
    } finally {
      setSharing(false);
    }
  };

  useEffect(() => {
    // Lecture par le haut-parleur, même en mode silencieux.
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
  }, []);

  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (status.duration > 0 && status.currentTime >= status.duration - 0.25) void player.seekTo(0);
      player.play();
    }
  };
  const skip = (delta: number) => {
    const t = Math.min(Math.max(0, status.currentTime + delta), Math.max(0, status.duration));
    void player.seekTo(t);
  };

  const verify = async () => {
    setIntegrity('checking');
    try {
      const f = finalFile(session.audioPath!);
      if (!f.exists) {
        setIntegrity('missing');
        return;
      }
      const digest = await f.digest('SHA-256');
      setIntegrity(digest === session.audioSha256 ? 'ok' : 'mismatch');
    } catch (e) {
      log.error('session.integrity_failed', { kind: e instanceof Error ? e.name : 'unknown' });
      setIntegrity('missing');
    }
  };

  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;

  return (
    <View style={[styles.player, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { backgroundColor: colors.accent, width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.times}>
        <Text style={{ color: colors.textMuted }}>{formatDuration(status.currentTime * 1000)}</Text>
        <Text style={{ color: colors.textMuted }}>{status.isLoaded ? formatDuration(status.duration * 1000) : '…'}</Text>
      </View>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Reculer de 15 secondes" onPress={() => skip(-15)} style={styles.skip}>
          <Text style={{ color: colors.textPrimary, fontSize: 16 }}>↺ 15</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Pause' : 'Lecture'}
          onPress={toggle}
          style={[styles.play, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.playText}>{status.playing ? '❚❚' : '▶'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Avancer de 15 secondes" onPress={() => skip(15)} style={styles.skip}>
          <Text style={{ color: colors.textPrimary, fontSize: 16 }}>15 ↻</Text>
        </Pressable>
      </View>
      <View style={styles.integrity}>
        <Button label="Exporter l’audio (Fichiers, Drive…)" onPress={() => void share()} busy={sharing} />
        {shareResult === 'unavailable' ? <Text style={{ color: colors.danger }}>Le partage n’est pas disponible sur cet appareil.</Text> : null}
        {shareResult === 'missing' ? <Text style={{ color: colors.danger }}>⚠ Fichier audio introuvable.</Text> : null}
        {shareResult === 'corrupted' ? (
          <Text style={{ color: colors.danger }}>⚠ La copie ne correspond pas à l’original : export annulé.</Text>
        ) : null}
        {shareResult === 'error' ? <Text style={{ color: colors.danger }}>L’export a échoué. Réessayez.</Text> : null}
        <Button label="Vérifier l’intégrité de l’audio" variant="secondary" onPress={() => void verify()} busy={integrity === 'checking'} />
        {integrity === 'ok' ? <Text style={{ color: colors.success }}>✓ Audio intact (SHA-256 identique à l’enregistrement)</Text> : null}
        {integrity === 'mismatch' ? <Text style={{ color: colors.danger }}>⚠ L’empreinte ne correspond pas à l’enregistrement d’origine.</Text> : null}
        {integrity === 'missing' ? <Text style={{ color: colors.danger }}>⚠ Fichier audio introuvable ou illisible.</Text> : null}
        {session.audioBytes ? (
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{(session.audioBytes / 1e6).toFixed(2)} Mo · AAC (m4a)</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  book: { fontSize: 24, fontWeight: '700' },
  meta: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm, gap: 6 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  player: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: spacing.md },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxl },
  skip: { padding: spacing.sm },
  play: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#0B0A0F', fontSize: 22, fontWeight: '700' },
  integrity: { gap: spacing.sm, marginTop: spacing.sm },
});
