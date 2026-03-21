import { loginSeller } from '@/lib/auth';
import { PlayfairDisplay_400Regular, useFonts } from '@expo-google-fonts/playfair-display';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEFAULT_EMAIL = 'seller@gmail.com';
const DEFAULT_PASSWORD = '1234';

export default function LoginScreen() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
  });
  const router = useRouter();
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [loading, setLoading] = useState(false);

  const handleSkip = () => {
    if (loading) return;
    router.replace('/(tabs)/home' as any);
  };

  const handleSignIn = async () => {
    if (loading) return;
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      await loginSeller({ email: email.trim(), password });
      router.replace('/(tabs)/home' as any);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('Login failed', message || 'Unable to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={styles.header}>
            <Text style={[styles.logo, fontsLoaded && styles.logoPlayfair]}>OUI</Text>
            <Text style={styles.tagline}>THE DIGITAL ATELIER</Text>
          </View>

          <View style={styles.titleWrap}>
            <Text style={styles.title}>Sign In</Text>
            <Text style={styles.subtitle}>Welcome back to your seller dashboard.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <TextInput
              style={styles.input}
              placeholder="name@atelier.com"
              placeholderTextColor="#a8adb6"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            <View style={styles.passwordHead}>
              <Text style={[styles.label, styles.labelTop]}>PASSWORD</Text>
              <TouchableOpacity style={styles.forgot} onPress={() => Alert.alert('Forgot password', 'Please contact support or use the web portal to reset your password.')}>
                <Text style={styles.forgotText}>FORGOT PASSWORD?</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#a8adb6"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
          </View>

          <TouchableOpacity style={[styles.signInButton, loading && styles.signInButtonDisabled]} onPress={handleSignIn} activeOpacity={0.8} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.signInText}>Sign in</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.8} disabled={loading}>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#17181f',
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    marginHorizontal: 16,
    marginVertical: 20,
    backgroundColor: '#eceef3',
    borderRadius: 0,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 26,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logo: {
    fontSize: 46,
    color: '#2d3238',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  logoPlayfair: {
    fontFamily: 'PlayfairDisplay_400Regular',
  },
  tagline: {
    fontSize: 11,
    color: '#8f939b',
    letterSpacing: 2.2,
  },
  titleWrap: {
    marginBottom: 22,
  },
  title: {
    fontSize: 34,
    color: '#2b3138',
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#6e7380',
  },
  form: {
    marginBottom: 26,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6c7180',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  labelTop: {
    marginTop: 18,
  },
  passwordHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  input: {
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#242a32',
    backgroundColor: '#e2e5ea',
  },
  forgot: {
    marginTop: 18,
  },
  forgotText: {
    fontSize: 10,
    color: '#697086',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  signInButton: {
    backgroundColor: '#8e97be',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInButtonDisabled: {
    opacity: 0.7,
  },
  signInText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  skipButton: {
    alignSelf: 'center',
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  skipText: {
    color: '#676f85',
    fontSize: 14,
    fontWeight: '600',
  },
  skipTextDisabled: {
    opacity: 0.6,
  },
});
