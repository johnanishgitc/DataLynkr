import React, { useState, useEffect, useRef } from 'react';
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
  InteractionManager,
} from 'react-native';
import Logo from '../components/Logo';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
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

type LoginMode = 'password' | 'otp';

export default function Login() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [loginMode, setLoginMode] = useState<LoginMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const scrollFieldAboveKeyboard = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }, 300);
  };

  const resetLoginLayout = React.useCallback(() => {
    Keyboard.dismiss();
    setKeyboardVisible(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      resetLoginLayout();
      const afterInteractions = InteractionManager.runAfterInteractions(() => {
        resetLoginLayout();
      });
      const delayed = setTimeout(resetLoginLayout, 500);
      return () => {
        afterInteractions.cancel();
        clearTimeout(delayed);
      };
    }, [resetLoginLayout])
  );

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

  const validateEmail = (): boolean => {
    const e = email.trim();
    if (!e) {
      setError('Email is required');
      return false;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(e)) {
      setError('Invalid email format');
      return false;
    }
    setError('');
    return true;
  };

  const validate = (): boolean => {
    const e = email.trim();
    if (loginMode === 'otp') {
      if (!validateEmail()) return false;
      if (otpSent) {
        if (!otp.trim()) {
          setError('Please enter the OTP');
          return false;
        }
        setError('');
        return true;
      }
      return true;
    }
    if (!validateEmail()) return false;
    const p = password.trim();
    if (!p) {
      setError('Password is required');
      return false;
    }
    setError('');
    return true;
  };

  const handleLoginSuccess = async (data: { token?: string | null; email?: string | null; name?: string | null; is_first_login?: number }) => {
    const t = data.token;
    const isFirstLogin = data.is_first_login === 1;
    if (t) {
      if (isFirstLogin) {
        nav.navigate('ResetPassword', {
          fromFirstLogin: true,
          email: data.email ?? email.trim(),
          name: data.name ?? null,
        });
      } else {
        await login(t, data.name ?? null, data.email ?? null);
      }
    } else {
      setError('Invalid response from server');
    }
  };

  const sendOtpRequest = async () => {
    if (!validateEmail() || loading) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await apiService.sendOtp({ email: email.trim() });
      if ((data as { error?: string }).error) {
        setError((data as { error?: string }).error || 'Failed to send OTP');
        return;
      }
      setOtpSent(true);
      setOtp('');
      setTimeout(() => otpInputRef.current?.focus(), 300);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Network error. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtpRequest = async () => {
    if (!validate() || loading) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await apiService.verifyOtp({ email: email.trim(), otp: otp.trim() });
      if (hasError(data)) {
        setError((data as { error?: string }).error || 'Invalid OTP');
        return;
      }
      await handleLoginSuccess(data as { token?: string | null; email?: string | null; name?: string | null; is_first_login?: number });
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Network error. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (loginMode === 'otp') {
      if (otpSent) {
        await verifyOtpRequest();
      } else {
        await sendOtpRequest();
      }
      return;
    }
    if (!validate() || loading) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await apiService.login({ email: email.trim(), password: password.trim() });
      if (hasError(data)) {
        setError((data as { error?: string }).error || 'Login failed');
        return;
      }
      await handleLoginSuccess(data as { token?: string | null; email?: string | null; name?: string | null; is_first_login?: number });
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'Network error. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const switchLoginMode = (mode: LoginMode) => {
    if (mode === loginMode) return;
    setLoginMode(mode);
    setError('');
    setOtpSent(false);
    setOtp('');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar backgroundColor="#ffffff" barStyle="dark-content" />
      <View style={styles.main}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : (keyboardVisible ? 'padding' : undefined)}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
              styles.scrollContent,
              keyboardVisible && styles.scrollContentKeyboardOpen,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
          >
            <View style={[styles.topSection, keyboardVisible && styles.topSectionKeyboardOpen]}>
              <Logo width={92} height={60} style={styles.logo} />
              <Text style={styles.brand}><Text style={styles.brandData}>Data</Text><Text style={styles.brandLynkr}>Lynkr</Text></Text>
            </View>

            <View style={styles.form}>
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[styles.modeTab, loginMode === 'password' && styles.modeTabActive]}
                  onPress={() => switchLoginMode('password')}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modeTabText, loginMode === 'password' && styles.modeTabTextActive]}>
                    {strings.login_with_password}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeTab, loginMode === 'otp' && styles.modeTabActive]}
                  onPress={() => switchLoginMode('otp')}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modeTabText, loginMode === 'otp' && styles.modeTabTextActive]}>
                    {strings.login_with_otp}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>{strings.email_address}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={strings.email_address_placeholder}
                  placeholderTextColor="#9ca3af"
                  value={email}
                  onChangeText={(t) => { setEmail(t); if (loginMode === 'otp') setOtpSent(false); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!loading}
                  accessibilityLabel={strings.email_address}
                  onFocus={scrollFieldAboveKeyboard}
                  returnKeyType={loginMode === 'otp' && !otpSent ? 'go' : 'next'}
                  onSubmitEditing={
                    loginMode === 'otp' && !otpSent
                      ? submit
                      : () => (loginMode === 'otp' ? otpInputRef.current?.focus() : passwordInputRef.current?.focus())
                  }
                  blurOnSubmit={false}
                />
              </View>

              {loginMode === 'password' ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>{strings.password}</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      ref={passwordInputRef}
                      style={styles.passwordInput}
                      placeholder={strings.password_placeholder}
                      placeholderTextColor="#9ca3af"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      editable={!loading}
                      onFocus={scrollFieldAboveKeyboard}
                      returnKeyType="go"
                      onSubmitEditing={submit}
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
              ) : otpSent ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>{strings.enter_otp}</Text>
                  <TextInput
                    ref={otpInputRef}
                    style={styles.input}
                    placeholder={strings.otp_placeholder}
                    placeholderTextColor="#9ca3af"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                    onFocus={scrollFieldAboveKeyboard}
                    returnKeyType="go"
                    onSubmitEditing={submit}
                  />
                </View>
              ) : null}

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
                  <Text style={styles.btnTxt}>
                    {loginMode === 'otp' ? (otpSent ? strings.verify_otp : strings.send_otp) : strings.login}
                  </Text>
                )}
              </TouchableOpacity>

              {!keyboardVisible && (
                <View style={styles.linksBelowButton}>
                  {loginMode === 'password' && (
                    <View style={styles.forgotResetRow}>
                      <TouchableOpacity onPress={() => nav.navigate('ForgotPassword')} disabled={loading}>
                        <Text style={styles.link}>{strings.forgot_password}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={styles.signupRow}>
                    <Text style={styles.signupPrompt}>{strings.signup_prompt}</Text>
                    <TouchableOpacity onPress={() => nav.navigate('Signup')} disabled={loading}>
                      <Text style={styles.signupLink}>{strings.signup}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {!keyboardVisible && (
        <View style={[styles.footer, { paddingBottom: 8 + insets.bottom }]}>
          <Text style={styles.footerText}>
            {'© '}
            <Text style={styles.footerIT}>IT</Text>
            {' '}
            <Text style={styles.footerCatalyst}>Catalyst</Text>
            {' Software India Pvt Ltd, 2025.'}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  main: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
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
  topSection: {
    alignItems: 'center',
    marginTop: -48,
    marginBottom: 40,
  },
  topSectionKeyboardOpen: {
    marginTop: 0,
  },
  logo: {
    width: 92,
    height: 60,
  },
  brand: {
    fontFamily: fonts.brand,
    fontWeight: '600',
    fontSize: 30,
    marginTop: 20,
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
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 4,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  modeTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  modeTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6a7282',
  },
  modeTabTextActive: {
    color: '#1f3a89',
    fontWeight: '600',
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
  linksBelowButton: {
    gap: 20,
  },
  forgotResetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  forgotWrap: {
    alignSelf: 'center',
  },
  link: {
    color: '#1f3a89',
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
    color: '#1f3a89',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#697282',
  },
  footerIT: {
    fontFamily: 'serif',
    fontStyle: 'italic',
    fontWeight: '700',
    color: '#CC7A2E',
  },
  footerCatalyst: {
    fontFamily: 'serif',
    fontStyle: 'italic',
    fontWeight: '700',
    color: '#000000',
  },
});
