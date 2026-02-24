import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { SplashScreen, Stack } from 'expo-router';
import * as NativeSplash from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { InteractionManager, Platform } from 'react-native';
import 'react-native-reanimated';

import { ErrorBoundary } from '@/components/error-boundary';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function hideSplash() {
  try {
    (SplashScreen as { hide?: () => void }).hide?.();
    SplashScreen.hideAsync?.();
    NativeSplash.hideAsync?.();
  } catch (_) {}
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Hide splash as early as possible (sync on first render) — critical for standalone APK
  hideSplash();

  useEffect(() => {
    // Hide again after first frame / interactions (APK can delay first paint)
    if (Platform.OS !== 'web') {
      const raf = requestAnimationFrame(() => {
        hideSplash();
        InteractionManager.runAfterInteractions(() => hideSplash());
      });
      const t = setTimeout(hideSplash, 1500);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(t);
      };
    } else {
      hideSplash();
    }
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="try-on" />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
