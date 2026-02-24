import { getSession } from '@/lib/auth';
import { useRouter, SplashScreen } from 'expo-router';
import * as NativeSplash from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function hideNativeSplash() {
  try {
    (SplashScreen as { hide?: () => void }).hide?.();
    SplashScreen.hideAsync?.();
    NativeSplash.hideAsync?.();
  } catch (_) {}
}

export default function InitialScreen() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  // Hide native splash as soon as this first screen mounts — important for APK
  useEffect(() => {
    hideNativeSplash();
  }, []);

  useEffect(() => {
    let mounted = true;
    const timeout = setTimeout(() => {
      if (!mounted) return;
      setCheckingSession(false);
      router.replace('/login');
    }, 4000);

    (async () => {
      try {
        const session = await getSession();
        if (!mounted) return;
        clearTimeout(timeout);
        if (session?.accessToken && session?.user?.id) router.replace('/(tabs)');
        else router.replace('/login');
      } catch {
        if (!mounted) return;
        clearTimeout(timeout);
        router.replace('/login');
      } finally {
        if (mounted) setCheckingSession(false);
      }
    })();
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.content} edges={['top', 'bottom']}>
        <View style={styles.spacer} />
        <View style={styles.textBlock}>
          <Text style={styles.title}>oui</Text>
          <Text style={styles.tagline}>
            Transform Your Style,{'\n'}
            Virtually Try On Every Smile :)
          </Text>
        </View>
        <TouchableOpacity style={styles.getStartedButton} onPress={() => router.replace('/login')} activeOpacity={0.8} disabled={checkingSession}>
          {checkingSession ? <ActivityIndicator color="#fff" /> : <Text style={styles.getStartedText}>Get Started</Text>}
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingBottom: 48,
  },
  spacer: {
    flex: 1,
  },
  textBlock: {
    paddingBottom: 40,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 1,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 18,
    color: '#333',
    lineHeight: 26,
    fontWeight: '400',
  },
  getStartedButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getStartedText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
