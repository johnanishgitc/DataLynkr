import React, { useState, useEffect } from 'react';
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
  Keyboard,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Logo from '../../components/Logo';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { apiService } from '../../api';
import { strings } from '../../constants/strings';
import { useAuth } from '../../store';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ResetPassword'>;
type ResetPasswordRoute = RouteProp<AuthStackParamList, 'ResetPassword'>;

export default function ResetPassword() {
  const nav = useNavigation<Nav>();
  const route = useRoute<ResetPasswordRoute>();
  const insets = useSafeAreaInsets();
  const { userEmail, login: authLogin } = useAuth();
  const fromFirstLogin = route.params?.fromFirstLogin === true;
  const paramEmail = route.params?.email ?? '';
  const paramName = route.params?.name ?? null;

  const [email, setEmail] = useState(paramEmail || userEmail || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = React.useRef<ScrollView>(null);

  const effectiveEmail = fromFirstLogin ? ((paramEmail || userEmail) ?? email) : email.trim();

  useEffect(() => {
    if (!fromFirstLogin && userEmail) setEmail(userEmail);
  }, [fromFirstLogin, userEmail]);

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(show, () => setKeyboardVisible(true));
    const subHide = Keyboard.addListener(hide, () => setKeyboardVisible(false));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const scrollAboveKeyboard = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 300);
  };

  const validate = (): boolean => {
    if (!fromFirstLogin && !email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!fromFirstLogin && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Invalid email format');
      return false;
    }
    if (!oldPassword.trim()) {
      setError('Enter old password');
      return false;
    }
    if (!newPassword.trim()) {
      setError('Enter new password');
      return false;
    }
    if (!confirmPassword.trim()) {
      setError('Confirm your new password');
      return false;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match');
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
      // 1. First login with old password to get token
      const loginRes = await apiService.login(
        { email: effectiveEmail, password: oldPassword.trim() },
        { skipUnauthorizedRedirect: true }
      );
      const loginData = loginRes.data as { token?: string | null; error?: string | null };
      if (loginData?.error) {
        Alert.alert(strings.error, loginData.error);
        return;
      }
      const token = loginData?.token ?? undefined;
      if (!token) {
        Alert.alert(strings.error, 'Could not get authorization. Please check your old password.');
        return;
      }
      // 2. Then change password using that token
      const { data } = await apiService.changePassword(
        {
          email: effectiveEmail,
          oldPassword: oldPassword.trim(),
          newPassword: newPassword.trim(),
        },
        token
      );
      const d = data as { message?: string | null; error?: string | null };
      if (d?.error) {
        Alert.alert(strings.error, d.error);
        return;
      }
      const onSuccess = () => {
        if (fromFirstLogin) {
          authLogin(token, paramName, effectiveEmail);
        }
        nav.navigate('Login');
      };
      Alert.alert(strings.success, d?.message ?? strings.password_changed_success, [
        { text: strings.ok, onPress: onSuccess },
      ]);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
      const msg =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        (err?.message && typeof err.message === 'string' ? err.message : 'Request failed. Please try again.');
      Alert.alert(strings.error, msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : (keyboardVisible ? 'padding' : undefined)}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scrollContent, keyboardVisible && styles.scrollContentKeyboardOpen]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
        >
          <View style={styles.card}>
            <View style={[styles.topSection, keyboardVisible && styles.topSectionKeyboardOpen]}>
              <Logo width={92} height={60} style={styles.logo} />
            </View>
            {!keyboardVisible && (
              <Text style={styles.heading}>{strings.reset_password}</Text>
            )}
            <View style={styles.form}>
              {!fromFirstLogin && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>{strings.email_id}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={strings.email_placeholder}
                    placeholderTextColor="#9ca3af"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!loading}
                    onFocus={scrollAboveKeyboard}
                  />
                </View>
              )}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{strings.password_sent_by_mail_placeholder}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={strings.password_sent_by_mail_placeholder}
                  placeholderTextColor="#9ca3af"
                  value={oldPassword}
                  onChangeText={setOldPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!loading}
                  onFocus={scrollAboveKeyboard}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{strings.enter_new_password_placeholder}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={strings.enter_new_password_placeholder}
                  placeholderTextColor="#9ca3af"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!loading}
                  onFocus={scrollAboveKeyboard}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{strings.confirm_new_password_placeholder}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={strings.confirm_new_password_placeholder}
                  placeholderTextColor="#9ca3af"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!loading}
                  onFocus={scrollAboveKeyboard}
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
                  <Text style={styles.btnTxt}>{strings.change_password}</Text>
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
  scrollContentKeyboardOpen: {
    paddingTop: 32,
    paddingBottom: 24,
    justifyContent: 'flex-start',
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
  topSectionKeyboardOpen: {
    marginTop: 0,
    marginBottom: 24,
  },
  logo: {
    width: 92,
    height: 60,
  },
  heading: {
    fontWeight: '400',
    fontSize: 24,
    color: '#1d2838',
    textAlign: 'center',
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
});
