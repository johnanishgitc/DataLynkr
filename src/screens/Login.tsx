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
  const [resendCountdown, setResendCountdown] = useState(0);
  const [showOtpSentMessage, setShowOtpSentMessage] = useState(false);
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

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  useEffect(() => {
    if (!showOtpSentMessage) return;
    const timer = setTimeout(() => setShowOtpSentMessage(false), 5000);
    return () => clearTimeout(timer);
  }, [showOtpSentMessage]);

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
      setResendCountdown(60);
      setShowOtpSentMessage(true);
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
    setResendCountdown(0);
    setShowOtpSentMessage(false);
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

              <View style={styles.credentialsGroup}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>{strings.email_address}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={strings.email_address_placeholder}
                    placeholderTextColor="#9ca3af"
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      if (loginMode === 'otp') {
                        setOtpSent(false);
                        setResendCountdown(0);
                        setShowOtpSentMessage(false);
                      }
                    }}
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
              </View>

              {error ? <Text style={styles.err}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.btn, loginMode === 'otp' && !otpSent && styles.btnOtp, loading && styles.btnDisabled]}
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
              {loginMode === 'otp' && otpSent && (
                <TouchableOpacity
                  style={[
                    styles.secondaryBtn,
                    (loading || resendCountdown > 0) && styles.secondaryBtnDisabled,
                    loading && styles.btnDisabled,
                  ]}
                  onPress={sendOtpRequest}
                  disabled={loading || resendCountdown > 0}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.secondaryBtnTxt, resendCountdown > 0 && styles.secondaryBtnTxtDisabled]}>
                    {resendCountdown > 0 ? `Resend OTP (${resendCountdown}s)` : 'Resend OTP'}
                  </Text>
                </TouchableOpacity>
              )}
              {loginMode === 'otp' && otpSent && showOtpSentMessage && (
                <View style={styles.otpSentMsgWrap}>
                  <Text style={styles.otpSentMsgText}>OTP Sent to Email</Text>
                </View>
              )}
              {loginMode === 'password' && (
                <TouchableOpacity
                  style={[styles.secondaryBtn, loading && styles.btnDisabled]}
                  onPress={() => switchLoginMode('otp')}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.secondaryBtnTxt}>{strings.login_with_otp}</Text>
                </TouchableOpacity>
              )}

              {!keyboardVisible && (
                <View style={styles.linksBelowButton}>
                  {loginMode === 'password' && (
                    <>
                      <View style={styles.signupRow}>
                        <Text style={styles.signupPrompt}>{strings.signup_prompt}</Text>
                        <TouchableOpacity onPress={() => nav.navigate('Signup')} disabled={loading}>
                          <Text style={styles.signupLink}>{strings.signup}</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.forgotResetRow}>
                        <TouchableOpacity onPress={() => nav.navigate('ForgotPassword')} disabled={loading}>
                          <Text style={styles.link}>{strings.forgot_password}</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  {loginMode === 'otp' && (
                    <View style={styles.forgotResetRow}>
                      <TouchableOpacity onPress={() => switchLoginMode('password')} disabled={loading}>
                        <Text style={styles.link}>{strings.back_to_login}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
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
    marginTop: 0,
    marginBottom: 20,
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
  credentialsGroup: {
    gap: 10,
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
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  btnOtp: {
    backgroundColor: '#000000',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  btnTxt: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: -8,
  },
  secondaryBtnTxt: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  secondaryBtnTxtDisabled: {
    color: '#E5E7EB',
  },
  otpSentMsgWrap: {
    minHeight: 50,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A9E1D3',
    backgroundColor: '#E8F6F0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  otpSentMsgText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2B7D68',
  },
  linksBelowButton: {
    gap: 12,
    marginTop: 5,
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
    fontFamily: 'Montserrat',
    fontStyle: 'italic',
    fontWeight: '700',
    color: '#697282',
  },
  footerCatalyst: {
    fontFamily: 'Montserrat',
    fontStyle: 'italic',
    fontWeight: '700',
    color: '#697282',
  },
});
