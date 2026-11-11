import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { useDb } from '@/data/db/DatabaseProvider';
import { updateTranscriptText, type SessionSummary } from '@/data/repositories/sessions';
import { confirmDestructive } from '@/features/deletion/confirm';
import { log } from '@/services/log';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { fileTranscriptionMessage } from './statusMessage';
import { transcribeSessionAudio } from './transcribeSession';

const STATUS_NOTE: Record<SessionSummary['transcriptStatus'], string | null> = {
  none: null,
  complete: null,
  partial: 'Transcription partielle (interrompue). L’audio complet reste disponible.',
  failed: 'La transcription en direct n’a pas pu avoir lieu.',
};

/**
 * Texte de la session : lecture, correction, (re)transcription depuis l'audio.
 * Aucune de ces actions ne modifie l'audio original.
 */
export function TranscriptPanel({
  session,
  allowNetwork,
  onChanged,
}: {
  session: SessionSummary;
  allowNetwork: boolean;
  onChanged: () => void;
}) {
  const db = useDb();
  const { colors, fonts } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.transcriptText);
  const [saving, setSaving] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const hasText = session.transcriptText.trim().length > 0;
  const canTranscribe = !!session.audioPath && session.state !== 'recording' && session.state !== 'paused';

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updateTranscriptText(db, session.id, draft.trim(), new Date().toISOString());
      setEditing(false);
      onChanged();
    } catch (e) {
      log.error('transcript.save_failed', { kind: e instanceof Error ? e.name : 'unknown' });
      setMessage('La correction n’a pas pu être enregistrée. Réessayez.');
    } finally {
      setSaving(false);
    }
  };

  const transcribe = async () => {
    if (hasText) {
      const ok = await confirmDestructive(
        'Retranscrire depuis l’audio ?',
        'Le texte actuel, y compris vos corrections, sera remplacé par une nouvelle transcription de l’enregistrement. L’audio n’est pas modifié.',
        'Retranscrire',
      );
      if (!ok) return;
    }
    setTranscribing(true);
    setMessage('Transcription de l’enregistrement en cours… (gardez l’app ouverte)');
    try {
      await transcribeSessionAudio(db, session, allowNetwork);
      setMessage(null);
      onChanged();
    } catch (e) {
      log.warn('transcript.file_failed', { kind: e instanceof Error ? e.name : 'unknown' });
      setMessage(fileTranscriptionMessage(e));
    } finally {
      setTranscribing(false);
    }
  };

  const note = STATUS_NOTE[session.transcriptStatus];

  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.textMuted }]}>TRANSCRIPTION</Text>
      {note ? <Text style={{ color: colors.warning, fontSize: 13 }}>{note}</Text> : null}

      {editing ? (
        <>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, fontFamily: fonts.serif }]}
          />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Corriger le texte ne modifie jamais l’enregistrement audio.</Text>
          <Button label="Enregistrer la correction" onPress={() => void save()} busy={saving} />
          <Button
            label="Annuler"
            variant="secondary"
            onPress={() => {
              setDraft(session.transcriptText);
              setEditing(false);
            }}
            disabled={saving}
          />
        </>
      ) : (
        <>
          <Text selectable style={[styles.text, { color: hasText ? colors.textPrimary : colors.textMuted, fontFamily: fonts.serif }]}>
            {hasText ? session.transcriptText : 'Pas encore de texte pour cette session.'}
          </Text>
          <View style={styles.actions}>
            <Button
              label={hasText ? 'Modifier le texte' : 'Écrire le texte'}
              variant="secondary"
              onPress={() => {
                setDraft(session.transcriptText);
                setEditing(true);
              }}
              disabled={transcribing}
            />
            {canTranscribe ? (
              <Button
                label={hasText ? 'Retranscrire depuis l’audio' : 'Transcrire l’audio'}
                variant={hasText ? 'secondary' : 'primary'}
                onPress={() => void transcribe()}
                busy={transcribing}
              />
            ) : null}
          </View>
        </>
      )}
      {message ? <Text style={{ color: transcribing ? colors.textSecondary : colors.danger, fontSize: 13 }}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: spacing.md },
  title: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  text: { fontSize: 17, lineHeight: 26 },
  input: { minHeight: 180, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, fontSize: 17, lineHeight: 25, textAlignVertical: 'top' },
  actions: { gap: spacing.sm },
});
