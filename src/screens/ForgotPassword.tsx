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
import { SafeAreaView } from 'react-native-safe-area-context';
import Logo from '../components/Logo';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { apiService } from '../api';
import { strings } from '../constants/strings';
import { fonts } from '../constants/fonts';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPassword() {
  const nav = useNavigation<Nav>();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const validate = (): boolean => {
    if (!email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Invalid email format');
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
      const { data } = await apiService.forgotPassword({ email: email.trim() });
      const d = data as { error?: string | null };
      if (d?.error) {
        setError(d.error);
        return;
      }
      setSuccess(true);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Request failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
        <View style={styles.successWrap}>
          <View style={styles.card}>
            <View style={styles.topSection}>
              <Logo width={74} height={48} style={styles.logo} />
              <Text style={styles.brand}>{strings.app_name}</Text>
            </View>
            <Text style={styles.successText}>{strings.forgot_password_success}</Text>
            <TouchableOpacity style={styles.btn} onPress={() => nav.navigate('Login')} activeOpacity={0.8}>
              <Text style={styles.btnTxt}>{strings.login}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>{strings.footer_copyright}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.topSection}>
              <Logo width={74} height={48} style={styles.logo} />
              <Text style={styles.brand}>{strings.app_name}</Text>
            </View>

            <Text style={styles.heading}>{strings.reset_password}</Text>
            <Text style={styles.description}>{strings.reset_password_description}</Text>

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
                />
              </View>

              <View style={styles.noteBox}>
                <Text style={styles.noteText}>
                  <Text style={styles.noteLabel}>{strings.reset_password_note_label}</Text>
                  <Text style={styles.noteBody}>{strings.reset_password_note}</Text>
                </Text>
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
                  <Text style={styles.btnTxt}>{strings.send_reset_link}</Text>
                )}
              </TouchableOpacity>

              <View style={styles.loginRow}>
                <Text style={styles.loginPrompt}>{strings.already_have_account}</Text>
                <TouchableOpacity onPress={() => nav.navigate('Login')} disabled={loading}>
                  <Text style={styles.loginLink}>{strings.login}</Text>
                </TouchableOpacity>
              </View>
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
    backgroundColor: '#e6f0ff',
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 5,
    padding: 24,
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
    fontWeight: '500',
    fontSize: 30,
    color: '#f4c74d',
    marginTop: 8,
  },
  heading: {
    fontWeight: '400',
    fontSize: 24,
    color: '#1d2838',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontWeight: '400',
    fontSize: 15,
    color: '#1d2838',
    lineHeight: 24,
    marginBottom: 20,
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
  noteBox: {
    backgroundColor: '#e6ecfd',
    borderWidth: 1,
    borderColor: '#c4d4ff',
    borderRadius: 4,
    padding: 10,
  },
  noteText: {
    fontSize: 13,
    lineHeight: 18,
  },
  noteLabel: {
    fontWeight: '500',
    color: '#0e172b',
  },
  noteBody: {
    fontWeight: '400',
    color: '#1e488f',
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
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  loginPrompt: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6a7282',
  },
  loginLink: {
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
  successWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  successText: {
    fontSize: 16,
    color: '#0e172b',
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 24,
  },
});
