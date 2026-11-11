import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

// Icônes provisoires (glyphes) : un jeu d'icônes dédié arrivera au lot UI.
function Glyph({ char, color }: { char: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18 }}>{char}</Text>;
}

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Bibliothèque', tabBarIcon: ({ color }) => <Glyph char="▤" color={color} /> }}
      />
      <Tabs.Screen
        name="archives"
        options={{ title: 'Archives', tabBarIcon: ({ color }) => <Glyph char="⌕" color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Réglages', tabBarIcon: ({ color }) => <Glyph char="⚙" color={color} /> }}
      />
    </Tabs>
  );
}
