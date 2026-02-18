import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { Link, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/Colors';
import type { Membership } from '@/types';

export default function LoginScreen() {
  const {
    signIn,
    requestPasswordReset,
    linkGoogleToAccount,
    selectMembership,
    authRoute,
    pendingMemberships,
    setAuthRoute,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot Password Modal
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const forgotTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Linking Modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkMode, setLinkMode] = useState('');
  const [linkCustomUserId, setLinkCustomUserId] = useState('');
  const [linkPendingCred, setLinkPendingCred] = useState<any>(null);

  // Role Selector
  const showRoleSelector = authRoute === 'role-selector' && !!pendingMemberships;

  useEffect(() => {
    return () => {
      if (forgotTimerRef.current) clearInterval(forgotTimerRef.current);
    };
  }, []);

  const startForgotCooldown = () => {
    setForgotCooldown(30);
    forgotTimerRef.current = setInterval(() => {
      setForgotCooldown((prev) => {
        if (prev <= 1) {
          if (forgotTimerRef.current) clearInterval(forgotTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Missing Fields', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const result = await signIn(email, password);

      if (result.redirect === 'verify-email') {
        router.replace('/verify-email');
        return;
      }
      if (result.redirect === 'onboarding') {
        router.replace('/onboarding');
        return;
      }
      if (result.redirect === 'waiting') {
        router.replace('/waiting');
        return;
      }
      if (result.redirect === 'accept-invite') {
        router.replace('/accept-invite');
        return;
      }

      // Pending invite check
      const pendingInvite = await AsyncStorage.getItem('pendingInvitationId');
      if (pendingInvite) {
        router.replace('/accept-invite');
        return;
      }
    } catch (error: any) {
      let message = 'Something went wrong. Please try again.';
      const code = error?.code || '';

      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials'
      ) {
        message = 'Invalid email or password.';
      } else if (code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please try again later.';
      } else if (code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      } else if (error?.message) {
        message = error.message;
      }

      Alert.alert('Login Failed', message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const targetEmail = forgotEmail.trim() || email.trim();
    if (!targetEmail) {
      Alert.alert('Missing Email', 'Please enter your email address.');
      return;
    }

    setForgotLoading(true);
    try {
      await requestPasswordReset(targetEmail);
      setForgotSent(true);
      startForgotCooldown();
    } catch (error: any) {
      let message = 'Something went wrong.';
      if (error?.code === 'auth/rate-limited') {
        message = error.message;
      } else if (error?.message) {
        message = error.message;
      }
      Alert.alert('Reset Failed', message);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleLinkAccount = async () => {
    if (!linkPassword) {
      Alert.alert('Missing Password', 'Please enter your password.');
      return;
    }

    setLinkLoading(true);
    try {
      await linkGoogleToAccount(linkEmail, linkPassword, linkCustomUserId, linkPendingCred, linkMode);
      setShowLinkModal(false);
    } catch (error: any) {
      Alert.alert('Linking Failed', error?.message || 'Could not link accounts.');
    } finally {
      setLinkLoading(false);
    }
  };

  const handleSelectRole = async (membership: Membership) => {
    try {
      await selectMembership(membership);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to select role.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.logoText}>BookingPenguin</Text>
          <Text style={styles.subtitle}>Sign in to manage your business</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={Colors.light.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Enter your password"
                placeholderTextColor={Colors.light.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                textContentType="password"
                editable={!loading}
              />
              <Pressable
                style={styles.showPasswordBtn}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.showPasswordText}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.linkBtn}
            onPress={() => {
              setForgotEmail(email);
              setForgotSent(false);
              setShowForgotModal(true);
            }}
          >
            <Text style={styles.linkText}>Forgot your password?</Text>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={styles.googleButton}
            onPress={() => {
              Alert.alert(
                'Google Sign-In',
                'Google Sign-In requires a development build. It is not available in Expo Go. Please create a dev build with EAS to enable this feature.'
              );
            }}
          >
            <Text style={styles.googleButtonText}>G</Text>
            <Text style={styles.googleButtonLabel}>Continue with Google</Text>
          </Pressable>

          <Link href="/(auth)/signup" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Create an Account</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal
        visible={showForgotModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowForgotModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            {forgotSent ? (
              <>
                <Text style={styles.modalSuccessIcon}>✓</Text>
                <Text style={styles.modalMessage}>
                  If an account exists for {forgotEmail}, you'll receive a password reset email shortly.
                </Text>
                <Pressable
                  style={[styles.button, forgotCooldown > 0 && styles.buttonDisabled]}
                  onPress={handleForgotPassword}
                  disabled={forgotCooldown > 0 || forgotLoading}
                >
                  <Text style={styles.buttonText}>
                    {forgotCooldown > 0 ? `Resend in ${forgotCooldown}s` : 'Resend'}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.modalSubtext}>
                  Enter your email and we'll send you a reset link.
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={Colors.light.textMuted}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!forgotLoading}
                />
                <View style={{ height: 12 }} />
                <Pressable
                  style={[styles.button, forgotLoading && styles.buttonDisabled]}
                  onPress={handleForgotPassword}
                  disabled={forgotLoading}
                >
                  {forgotLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Send Reset Link</Text>
                  )}
                </Pressable>
              </>
            )}
            <Pressable
              style={styles.modalCancel}
              onPress={() => setShowForgotModal(false)}
            >
              <Text style={styles.modalCancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Account Linking Modal */}
      <Modal
        visible={showLinkModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLinkModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Link Your Accounts</Text>
            <Text style={styles.modalSubtext}>
              An account with {linkEmail} already exists. Enter your password to link your Google account.
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: '#f1f5f9' }]}
              value={linkEmail}
              editable={false}
            />
            <View style={{ height: 12 }} />
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={Colors.light.textMuted}
              value={linkPassword}
              onChangeText={setLinkPassword}
              secureTextEntry
              editable={!linkLoading}
            />
            <View style={{ height: 12 }} />
            <Pressable
              style={[styles.button, linkLoading && styles.buttonDisabled]}
              onPress={handleLinkAccount}
              disabled={linkLoading}
            >
              {linkLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Link & Sign In</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.modalCancel}
              onPress={() => {
                setShowLinkModal(false);
                setLinkPassword('');
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Role Selector Modal */}
      <Modal
        visible={showRoleSelector}
        transparent
        animationType="slide"
        onRequestClose={() => setAuthRoute('login')}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Workspace</Text>
            <Text style={styles.modalSubtext}>
              You have access to multiple workspaces. Choose one to continue.
            </Text>
            <FlatList
              data={pendingMemberships || []}
              keyExtractor={(item, i) => `${item.businessId}-${item.role}-${i}`}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.roleCard}
                  onPress={() => handleSelectRole(item)}
                >
                  <View style={styles.roleCardContent}>
                    <Text style={styles.roleCardName}>
                      {item.businessName || 'Unnamed Business'}
                    </Text>
                    <View style={[styles.roleBadge, item.role === 'owner' && styles.ownerBadge]}>
                      <Text style={styles.roleBadgeText}>
                        {item.role.charAt(0).toUpperCase() + item.role.slice(1)}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              )}
              style={{ maxHeight: 300 }}
            />
            <Pressable
              style={styles.modalCancel}
              onPress={() => setAuthRoute('login')}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.light.headerBg,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.light.textSecondary,
    marginTop: 8,
  },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: Colors.light.surface,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 60,
  },
  showPasswordBtn: {
    position: 'absolute',
    right: 14,
    top: 14,
  },
  showPasswordText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  button: {
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkBtn: {
    alignItems: 'center',
    marginTop: 16,
    padding: 8,
  },
  linkText: {
    color: Colors.light.tint,
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.light.border,
  },
  dividerText: {
    marginHorizontal: 16,
    color: Colors.light.textMuted,
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 16,
    backgroundColor: Colors.light.surface,
    marginBottom: 12,
  },
  googleButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
    marginRight: 10,
  },
  googleButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
  },
  secondaryButtonText: {
    color: Colors.light.text,
    fontSize: 16,
    fontWeight: '600',
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtext: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  modalSuccessIcon: {
    fontSize: 40,
    color: Colors.light.success,
    textAlign: 'center',
    marginVertical: 12,
    fontWeight: '700',
  },
  modalMessage: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  modalCancel: {
    alignItems: 'center',
    marginTop: 16,
    padding: 8,
  },
  modalCancelText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  roleCard: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
    backgroundColor: Colors.light.surface,
  },
  roleCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roleCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
  },
  roleBadge: {
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  ownerBadge: {
    backgroundColor: '#7c3aed',
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
