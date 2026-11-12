import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseProvider } from '@/data/db/DatabaseProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function RootStack() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <DatabaseProvider>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.accent,
            headerTitleStyle: { color: colors.textPrimary },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="volume/new" options={{ title: 'Nouveau livre', presentation: 'modal' }} />
          <Stack.Screen name="search/index" options={{ title: 'Rechercher un livre' }} />
          <Stack.Screen name="search/edition" options={{ title: 'Vérifier l’édition' }} />
          <Stack.Screen name="search/batch" options={{ title: 'Ajouter plusieurs tomes' }} />
          <Stack.Screen name="volume/[id]/index" options={{ title: '', headerTransparent: true }} />
          <Stack.Screen name="volume/[id]/edit" options={{ title: 'Modifier', presentation: 'modal' }} />
          <Stack.Screen name="volume/[id]/record" options={{ title: 'Session', presentation: 'fullScreenModal' }} />
          <Stack.Screen name="series/new" options={{ title: 'Nouvelle série', presentation: 'modal' }} />
          <Stack.Screen name="series/[id]/index" options={{ title: '', headerTransparent: true }} />
          <Stack.Screen name="series/[id]/edit" options={{ title: 'Modifier la série', presentation: 'modal' }} />
          <Stack.Screen name="session/[id]" options={{ title: 'Session' }} />
          <Stack.Screen name="diagnostic" options={{ title: 'Diagnostic technique' }} />
        </Stack>
      </DatabaseProvider>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootStack />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
