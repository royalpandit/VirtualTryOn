import { FontFamily } from '@/constants/theme';
import { loginSeller } from '@/lib/auth';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DEFAULT_EMAIL = 'bensharma8766@gmail.com';
const DEFAULT_PASSWORD = '1234';

export default function LoginScreen() {
  const router = useRouter();
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
    <View style={st.container}>
      {/* Decorative background circles */}
      <View style={st.bgCircle1} />
      <View style={st.bgCircle2} />
      <View style={st.bgCircle3} />

      <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={st.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Brand header */}
            <View style={st.brandWrap}>
              <Text style={st.brandText}>OUI</Text>
              <Text style={st.brandTagline}>THE DIGITAL ATELIER</Text>
            </View>

            {/* Sign In title */}
            <View style={st.titleWrap}>
              <Text style={st.title}>Sign In</Text>
              <Text style={st.subtitle}>Welcome back to your style journey.</Text>
            </View>

            {/* Form */}
            <View style={st.form}>
              <Text style={st.label}>EMAIL ADDRESS</Text>
              <View style={st.inputWrap}>
                <TextInput
                  style={st.input}
                  placeholder="name@atelier.com"
                  placeholderTextColor="#9BA1A6"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>

              <View style={st.passwordHeader}>
                <Text style={st.label}>PASSWORD</Text>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert(
                      'Forgot password',
                      'Please contact support or use the web portal to reset your password.',
                    )
                  }
                >
                  <Text style={st.forgotText}>FORGOT PASSWORD?</Text>
                </TouchableOpacity>
              </View>
              <View style={st.inputWrap}>
                <TextInput
                  style={st.input}
                  placeholder="••••••••"
                  placeholderTextColor="#9BA1A6"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!loading}
                />
              </View>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              onPress={handleSignIn}
              activeOpacity={0.85}
              disabled={loading}
              style={st.signInBtnOuter}
            >
              <LinearGradient
                colors={['#575E7C', '#D5DBFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={st.signInBtn}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={st.signInBtnText}>SIGN IN</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={st.dividerRow}>
              <View style={st.dividerLine} />
              <Text style={st.dividerText}>EXPERIENCE EXCELLENCE</Text>
              <View style={st.dividerLine} />
            </View>

            {/* Sign up link */}
            <View style={st.signUpRow}>
              <Text style={st.signUpText}>Don't have an account? </Text>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    'Create Account',
                    'Please visit the web portal or contact support to create a new account.',
                  )
                }
              >
                <Text style={st.signUpLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ECEEF3',
  },
  safe: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 40,
    justifyContent: 'center',
  },

  /* decorative circles */
  bgCircle1: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    borderRadius: SCREEN_WIDTH * 0.35,
    backgroundColor: 'rgba(213,219,255,0.20)',
    top: -SCREEN_WIDTH * 0.15,
    right: -SCREEN_WIDTH * 0.2,
  },
  bgCircle2: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.5,
    height: SCREEN_WIDTH * 0.5,
    borderRadius: SCREEN_WIDTH * 0.25,
    backgroundColor: 'rgba(225,196,244,0.20)',
    bottom: SCREEN_HEIGHT * 0.12,
    left: -SCREEN_WIDTH * 0.18,
  },
  bgCircle3: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.35,
    height: SCREEN_WIDTH * 0.35,
    borderRadius: SCREEN_WIDTH * 0.175,
    backgroundColor: 'rgba(213,219,255,0.15)',
    bottom: -SCREEN_WIDTH * 0.08,
    right: SCREEN_WIDTH * 0.08,
  },

  /* brand */
  brandWrap: {
    alignItems: 'center',
    marginBottom: 36,
  },
  brandText: {
    fontSize: 52,
    fontFamily: FontFamily.brand,
    color: '#2D3335',
    letterSpacing: 4,
  },
  brandTagline: {
    fontSize: 11,
    fontFamily: FontFamily.body,
    color: '#5A6062',
    letterSpacing: 3,
    marginTop: 4,
  },

  /* titles */
  titleWrap: {
    marginBottom: 28,
  },
  title: {
    fontSize: 32,
    fontFamily: FontFamily.headingExtra,
    color: '#2D3335',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: FontFamily.body,
    color: '#5A6062',
  },

  /* form */
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 11,
    fontFamily: FontFamily.bodySemiBold,
    color: '#5A6062',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 8,
  },
  forgotText: {
    fontSize: 11,
    fontFamily: FontFamily.bodySemiBold,
    color: '#575E7C',
    letterSpacing: 1,
  },
  inputWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E9EB',
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    fontSize: 15,
    fontFamily: FontFamily.body,
    color: '#2D3335',
  },

  /* sign-in button */
  signInBtnOuter: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 28,
  },
  signInBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  signInBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FontFamily.heading,
    letterSpacing: 2,
  },

  /* divider */
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D5D8DC',
  },
  dividerText: {
    marginHorizontal: 14,
    fontSize: 10,
    fontFamily: FontFamily.bodySemiBold,
    color: '#9BA1A6',
    letterSpacing: 2,
  },

  /* sign up */
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signUpText: {
    fontSize: 14,
    fontFamily: FontFamily.body,
    color: '#5A6062',
  },
  signUpLink: {
    fontSize: 14,
    fontFamily: FontFamily.heading,
    color: '#575E7C',
    textDecorationLine: 'underline',
  },
});
