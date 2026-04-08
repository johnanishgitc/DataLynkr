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
import Logo from '../../components/Logo';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { apiService } from '../../api';
import { strings } from '../../constants/strings';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Signup'>;

export default function Signup() {
  const nav = useNavigation<Nav>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const validate = (): boolean => {
    if (!name.trim()) {
      setError('Name is required');
      return false;
    }
    if (!email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Invalid email format');
      return false;
    }
    if (!mobile.trim()) {
      setError('Mobile number is required');
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
      const num = mobile.trim().replace(/\D/g, '');
      const { data } = await apiService.signup({
        name: name.trim(),
        email: email.trim(),
        mobilno: num ? parseInt(num, 10) : 0,
      });
      const d = data as { success?: boolean; error?: string | null; message?: string | null };
      if (d?.error) {
        setError(d.error);
        return;
      }
      setSuccess(true);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Signup failed. Please try again.';
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
              <Logo width={92} height={60} style={styles.logo} />
            </View>
            <Text style={styles.successText}>{strings.signup_success}</Text>
            <TouchableOpacity style={styles.btn} onPress={() => nav.navigate('Login')} activeOpacity={0.8}>
              <Text style={styles.btnTxt}>{strings.login}</Text>
            </TouchableOpacity>
          </View>
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
              <Logo width={92} height={60} style={styles.logo} />
              <Text style={styles.heading}>{strings.create_account}</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{strings.name}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={strings.name_placeholder}
                  placeholderTextColor="#9ca3af"
                  value={name}
                  onChangeText={setName}
                  editable={!loading}
                />
              </View>

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

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{strings.mobile_no}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={strings.mobile_placeholder}
                  placeholderTextColor="#9ca3af"
                  value={mobile}
                  onChangeText={setMobile}
                  keyboardType="phone-pad"
                  editable={!loading}
                />
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
                  <Text style={styles.btnTxt}>{strings.signup}</Text>
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 5,
    padding: 24,
  },
  topSection: {
    alignItems: 'center',
    marginTop: -48,
    marginBottom: 24,
  },
  logo: {
    width: 92,
    height: 60,
  },
  heading: {
    fontWeight: '400',
    fontSize: 24,
    color: '#0e172b',
    marginTop: 22,
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
  err: {
    color: '#c00',
    fontSize: 14,
  },
  btn: {
    backgroundColor: '#1f3a89',
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
    color: '#1f3a89',
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
