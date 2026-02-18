import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { sendVerificationCode, verifyEmailCode, findUserByEmail } from '@/services/auth';
import { auth } from '@/services/firebase';
import Colors from '@/constants/Colors';

const CODE_LENGTH = 6;
const TIMER_SECONDS = 300; // 5 minutes
const RESEND_COOLDOWN = 30;

export default function VerifyEmailScreen() {
  const { setAuthRoute, customUserId } = useAuth();

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [timer, setTimer] = useState(TIMER_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSentRef = useRef(false);

  useEffect(() => {
    loadPendingData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (resendRef.current) clearInterval(resendRef.current);
    };
  }, []);

  const loadPendingData = async () => {
    const pending = await AsyncStorage.getItem('bp_pendingVerification');
    if (pending) {
      const { email: pendingEmail, customUserId: pendingUserId } = JSON.parse(pending);
      setEmail(pendingEmail);
      setUserId(pendingUserId || customUserId || '');
    } else {
      const currentEmail = auth.currentUser?.email || '';
      setEmail(currentEmail);
      setUserId(customUserId || '');
    }
  };

  useEffect(() => {
    if (email && userId && !hasSentRef.current) {
      hasSentRef.current = true;
      handleSendCode();
    }
  }, [email, userId]);

  const startTimer = useCallback(() => {
    setTimer(TIMER_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const startResendCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN);
    if (resendRef.current) clearInterval(resendRef.current);
    resendRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendRef.current) clearInterval(resendRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSendCode = async () => {
    if (!email || !userId) return;

    setSending(true);
    try {
      await sendVerificationCode(email, userId);
      startTimer();
      startResendCooldown();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to send verification code.');
    } finally {
      setSending(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    // Handle paste
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
      const newCode = [...code];
      for (let i = 0; i < digits.length && index + i < CODE_LENGTH; i++) {
        newCode[index + i] = digits[i];
      }
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, CODE_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();

      if (newCode.every((d) => d !== '')) {
        handleVerify(newCode.join(''));
      }
      return;
    }

    const digit = value.replace(/\D/g, '');
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newCode.every((d) => d !== '')) {
      handleVerify(newCode.join(''));
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (codeStr?: string) => {
    const finalCode = codeStr || code.join('');
    if (finalCode.length !== CODE_LENGTH) {
      Alert.alert('Invalid Code', 'Please enter the complete 6-digit code.');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    try {
      const result = await verifyEmailCode(email, finalCode, userId);

      if (result.success) {
        await AsyncStorage.removeItem('bp_pendingVerification');

        const pendingInviteId = await AsyncStorage.getItem('pendingInvitationId');
        if (pendingInviteId) {
          setAuthRoute('accept-invite');
          router.replace('/accept-invite');
          return;
        }

        const fsUser = await findUserByEmail(email);
        const memberships = fsUser.userData?.memberships || [];
        const active = memberships.filter((m: any) => m.status === 'active');

        if (active.length > 0) {
          setAuthRoute('dashboard');
        } else {
          setAuthRoute('onboarding');
          router.replace('/onboarding');
        }
      } else {
        if (result.expired) {
          Alert.alert('Code Expired', 'Your code has expired. Please request a new one.');
        } else if (result.maxAttempts) {
          Alert.alert('Too Many Attempts', 'Maximum attempts exceeded. Please request a new code.');
        } else {
          Alert.alert(
            'Wrong Code',
            `Invalid code. ${result.attemptsLeft !== undefined ? `${result.attemptsLeft} attempts remaining.` : 'Please try again.'}`
          );
        }
        setCode(Array(CODE_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
      }
    } catch (error: any) {
      Alert.alert('Verification Failed', error?.message || 'Something went wrong.');
      setCode(Array(CODE_LENGTH).fill(''));
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const timerColor =
    timer > 60 ? Colors.light.success : timer > 30 ? Colors.light.warning : Colors.light.danger;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>✉</Text>
        </View>

        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.subtitle}>
          We've sent a 6-digit code to{'\n'}
          <Text style={styles.emailText}>{email}</Text>
        </Text>

        <View style={styles.codeRow}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { inputRefs.current[index] = ref; }}
              style={[
                styles.codeInput,
                digit ? styles.codeInputFilled : null,
                loading ? styles.codeInputDisabled : null,
              ]}
              value={digit}
              onChangeText={(val) => handleCodeChange(index, val)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={index === 0 ? CODE_LENGTH : 1}
              editable={!loading}
              selectTextOnFocus
            />
          ))}
        </View>

        {timer > 0 && (
          <Text style={[styles.timer, { color: timerColor }]}>
            Code expires in {formatTime(timer)}
          </Text>
        )}
        {timer === 0 && (
          <Text style={[styles.timer, { color: Colors.light.danger }]}>
            Code has expired
          </Text>
        )}

        <Pressable
          style={[styles.verifyButton, loading && styles.buttonDisabled]}
          onPress={() => handleVerify()}
          disabled={loading || code.some((d) => !d)}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.verifyButtonText}>Verify Email</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.resendButton, (resendCooldown > 0 || sending) && styles.buttonDisabled]}
          onPress={handleSendCode}
          disabled={resendCooldown > 0 || sending}
        >
          {sending ? (
            <ActivityIndicator color={Colors.light.tint} size="small" />
          ) : (
            <Text style={styles.resendText}>
              {resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : "Didn't receive the code? Resend"}
            </Text>
          )}
        </Pressable>

        <Pressable
          style={styles.backButton}
          onPress={() => {
            setAuthRoute('login');
            router.replace('/(auth)/login');
          }}
        >
          <Text style={styles.backText}>Back to Login</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  emailText: {
    fontWeight: '600',
    color: Colors.light.tint,
  },
  codeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  codeInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: Colors.light.border,
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
    textAlign: 'center',
    backgroundColor: Colors.light.surface,
  },
  codeInputFilled: {
    borderColor: Colors.light.tint,
  },
  codeInputDisabled: {
    opacity: 0.5,
  },
  timer: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 24,
  },
  verifyButton: {
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    marginTop: 20,
    padding: 8,
  },
  resendText: {
    color: Colors.light.tint,
    fontSize: 14,
    fontWeight: '500',
  },
  backButton: {
    marginTop: 12,
    padding: 8,
  },
  backText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});
