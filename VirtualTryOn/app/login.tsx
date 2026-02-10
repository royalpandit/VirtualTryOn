import { loginAdmin, loginSeller } from '@/lib/auth';
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

type LoginRole = 'seller' | 'admin';

const DEFAULT_EMAIL = 'seller@gmail.com';
const DEFAULT_PASSWORD = '1234';

export default function LoginScreen() {
  const router = useRouter();
  const [role, setRole] = useState<LoginRole>('seller');
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (loading) return;
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      if (role === 'admin') {
        await loginAdmin({ email: email.trim(), password });
      } else {
        await loginSeller({ email: email.trim(), password });
      }
      router.replace('/(tabs)');
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
            <Text style={styles.logo}>oui</Text>
            <Text style={styles.welcome}>Sign in to continue</Text>
          </View>

          <View style={styles.roleRow}>
            <TouchableOpacity
              style={[styles.roleChip, role === 'seller' && styles.roleChipActive]}
              onPress={() => setRole('seller')}
              disabled={loading}
            >
              <Text style={[styles.roleChipText, role === 'seller' && styles.roleChipTextActive]}>Seller</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleChip, role === 'admin' && styles.roleChipActive]}
              onPress={() => setRole('admin')}
              disabled={loading}
            >
              <Text style={[styles.roleChipText, role === 'admin' && styles.roleChipTextActive]}>Admin</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="seller@gmail.com"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            <Text style={[styles.label, styles.labelTop]}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
            <TouchableOpacity style={styles.forgot} onPress={() => Alert.alert('Forgot password', 'Please contact support or use the web portal to reset your password.')}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.signInButton, loading && styles.signInButtonDisabled]} onPress={handleSignIn} activeOpacity={0.8} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.signInText}>Sign in</Text>}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => Alert.alert('Sign up', 'Seller sign up is available on the web portal. Contact your admin for access.')}>
              <Text style={styles.signUpLink}>Sign up</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 24,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  roleChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
    alignItems: 'center',
  },
  roleChipActive: {
    backgroundColor: '#6B4EAA',
    borderColor: '#6B4EAA',
  },
  roleChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  roleChipTextActive: {
    color: '#fff',
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    color: '#6B4EAA',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  welcome: {
    fontSize: 17,
    color: '#555',
  },
  form: {
    marginBottom: 28,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  labelTop: {
    marginTop: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0d8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1a1a2e',
    backgroundColor: '#faf8fc',
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: 12,
  },
  forgotText: {
    fontSize: 14,
    color: '#6B4EAA',
  },
  signInButton: {
    backgroundColor: '#6B4EAA',
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
    fontSize: 17,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 15,
    color: '#555',
  },
  signUpLink: {
    fontSize: 15,
    color: '#6B4EAA',
    fontWeight: '600',
  },
});
