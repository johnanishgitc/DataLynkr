import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import Logo from '../components/Logo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../store';
import { apiService } from '../api';
import { strings } from '../constants/strings';
import { fonts } from '../constants/fonts';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

function hasError(r: { error?: string | null; token?: string | null }): boolean {
  return !!(r?.error && (r.error as string).trim().length > 0);
}

export default function Login() {
  const nav = useNavigation<Nav>();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const validate = (): boolean => {
    const e = email.trim();
    const p = password.trim();
    if (!e) {
      setError('Email is required');
      return false;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(e)) {
      setError('Invalid email format');
      return false;
    }
    if (!p) {
      setError('Password is required');
      return false;
    }
    setError('');
    return true;
  };

  const submit = async () => {
    if (!validate() || loading) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await apiService.login({ email: email.trim(), password: password.trim() });
      if (hasError(data)) {
        setError((data as { error?: string }).error || 'Login failed');
        return;
      }
      const t = (data as { token?: string | null }).token;
      if (t) {
        await login(t, (data as { name?: string | null }).name ?? null, (data as { email?: string | null }).email ?? null);
      } else {
        setError('Invalid response from server');
      }
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Network error. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topSection}>
            <Logo width={74} height={48} style={styles.logo} />
            <Text style={styles.brand}><Text style={styles.brandData}>Data</Text><Text style={styles.brandLynkr}>Lynkr</Text></Text>
          </View>

          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{strings.email_id}</Text>
              <TextInput
                style={styles.input}
                placeholder={strings.email_placeholder}
                placeholderTextColor="#9ca3af"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!loading}
                accessibilityLabel={strings.email_id}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{strings.password}</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder={strings.password_placeholder}
                  placeholderTextColor="#9ca3af"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eyeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  disabled={loading}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} color="#828D94" />
                </TouchableOpacity>
              </View>
            </View>

            {error ? <Text style={styles.err}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={submit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnTxt}>{strings.login}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => nav.navigate('ForgotPassword')} disabled={loading} style={styles.forgotWrap}>
              <Text style={styles.link}>{strings.forgot_password}</Text>
            </TouchableOpacity>

            <View style={styles.signupRow}>
              <Text style={styles.signupPrompt}>{strings.signup_prompt}</Text>
              <TouchableOpacity onPress={() => nav.navigate('Signup')} disabled={loading}>
                <Text style={styles.signupLink}>{strings.signup}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{strings.footer_copyright}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  topSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 73.5,
    height: 48,
  },
  brand: {
    fontFamily: fonts.brand,
    fontWeight: '600',
    fontSize: 30,
    marginTop: 8,
    letterSpacing: 0,
  },
  brandData: {
    color: '#000000',
  },
  brandLynkr: {
    color: '#000000',
  },
  form: {
    gap: 20,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '400',
    color: '#0e172b',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d3d3d3',
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0e172b',
    backgroundColor: '#ffffff',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d3d3d3',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    paddingRight: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0e172b',
  },
  eyeBtn: {
    padding: 4,
  },
  err: {
    color: '#c00',
    fontSize: 14,
  },
  btn: {
    backgroundColor: '#1e488f',
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  btnTxt: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '400',
  },
  forgotWrap: {
    alignSelf: 'center',
  },
  link: {
    color: '#1e488f',
    fontSize: 14,
    fontWeight: '500',
  },
  signupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  signupPrompt: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6a7282',
  },
  signupLink: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e488f',
  },
  footer: {
    borderTopWidth: 1.27,
    borderTopColor: 'rgba(0,0,0,0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#697282',
  },
});
