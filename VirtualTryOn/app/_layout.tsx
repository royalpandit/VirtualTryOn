import { AbhayaLibre_700Bold } from '@expo-google-fonts/abhaya-libre';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { SplashScreen, Stack } from 'expo-router';
import * as NativeSplash from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { InteractionManager, Platform, StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

import { ErrorBoundary } from '@/components/error-boundary';
import { KioskCartProvider } from '@/context/KioskCartContext';
import { WishlistProvider } from '@/context/WishlistContext';
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
  const [fontsLoaded] = useFonts({
    AbhayaLibre_700Bold,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [showBrandSplash, setShowBrandSplash] = useState(true);

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

  useEffect(() => {
    const t = setTimeout(() => setShowBrandSplash(false), 2200);
    return () => clearTimeout(t);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <KioskCartProvider>
          <WishlistProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="try-on" />
            <Stack.Screen name="cart" />
            <Stack.Screen name="products" />
            <Stack.Screen name="collections" />
            <Stack.Screen name="product-details" />
            <Stack.Screen name="qr-checkout" />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          {showBrandSplash ? (
            <View style={styles.splashOverlay}>
              <Image source={require('@/assets/images/splash.png')} style={styles.splashImage} contentFit="cover" />
              <View style={styles.splashTint} />
              <View style={styles.splashTextWrap}>
                <Text style={[styles.splashBrand, fontsLoaded && styles.splashBrandFont]}>OUI</Text>
              </View>
            </View>
          ) : null}
          </WishlistProvider>
        </KioskCartProvider>
        <StatusBar style="dark" />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: '#0f0f10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashImage: {
    ...StyleSheet.absoluteFillObject,
  },
  splashTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  splashTextWrap: {
    position: 'absolute',
    top: '14%',
    width: '100%',
    alignItems: 'center',
  },
  splashBrand: {
    color: '#F5F5F5',
    fontSize: 34,
    fontWeight: '400',
    letterSpacing: 5.5,
    textTransform: 'uppercase',
  },
  splashBrandFont: {
    fontFamily: 'AbhayaLibre_700Bold',
  },
});
