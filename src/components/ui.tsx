import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  big,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  big?: boolean;
}) {
  const { colors } = useTheme();
  const bg = variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : colors.surfaceRaised;
  const fg = variant === 'secondary' ? colors.textPrimary : '#0B0A0F';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        big && styles.big,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        variant === 'secondary' && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, big && styles.bigText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  required,
  ...input
}: TextInputProps & { label: string; error?: string; required?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
        {label}
        {required ? <Text style={{ color: colors.accent }}> *</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...input}
        style={[
          styles.input,
          { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border },
          input.multiline && { minHeight: 96, textAlignVertical: 'top' },
        ]}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.surfaceRaised : colors.surface }]}
    >
      <Text style={{ color: selected ? colors.accent : colors.textSecondary, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[styles.section, { color: colors.textMuted }]}>{children}</Text>;
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary, fontFamily: fonts.serif }]}>{title}</Text>
      <Text style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 21 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { paddingVertical: 13, paddingHorizontal: spacing.xl, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  big: { paddingVertical: 18, borderRadius: radius.lg },
  buttonText: { fontSize: 16, fontWeight: '700' },
  bigText: { fontSize: 18 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: 16 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: spacing.lg },
  empty: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.lg, gap: spacing.sm },
  emptyTitle: { fontSize: 22, fontWeight: '700' },
});
