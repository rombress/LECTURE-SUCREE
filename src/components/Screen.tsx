import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';

export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.textPrimary, fontFamily: fonts.serif }]}
        >
          {title}
        </Text>
        {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Placeholder({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.placeholder, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.placeholderText, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  title: {
    fontSize: typography.display.fontSize,
    lineHeight: typography.display.lineHeight,
    fontWeight: typography.display.fontWeight,
  },
  subtitle: { marginTop: spacing.sm, fontSize: typography.body.fontSize, lineHeight: typography.body.lineHeight },
  body: { marginTop: spacing.xl, gap: spacing.md },
  placeholder: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: spacing.xl },
  placeholderText: { fontSize: typography.body.fontSize, lineHeight: typography.body.lineHeight },
});
