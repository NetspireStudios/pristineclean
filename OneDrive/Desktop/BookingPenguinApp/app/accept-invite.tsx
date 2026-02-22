import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import {
  getInvitation,
  acceptInvitationForUser,
  validatePassword,
  findUserByEmail,
} from '@/services/auth';
import { auth } from '@/services/firebase';
import Colors from '@/constants/Colors';

type AuthPath = 'choose' | 'login' | 'signup';

export default function AcceptInviteScreen() {
  const { setAuthRoute, refreshUserContext, signOut } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();

  const [invitation, setInvitation] = useState<any>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);

  const [authPath, setAuthPath] = useState<AuthPath>('choose');
  const isLoggedIn = !!auth.currentUser;
  const loggedEmail = auth.currentUser?.email?.toLowerCase() || '';

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Signup fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  useEffect(() => {
    loadInvitation();
  }, []);

  const loadInvitation = async () => {
    setLoadingInvite(true);
    try {
      let inviteId = params.id;

      if (!inviteId) {
        inviteId = (await AsyncStorage.getItem('pendingInvitationId')) || '';
      }

      if (!inviteId) {
        setError('No invitation ID found.');
        return;
      }

      const inv = await getInvitation(inviteId);
      if (!inv) {
        setError('Invitation not found or has been deleted.');
        return;
      }
      if (inv.status !== 'pending') {
        setError(`This invitation has already been ${inv.status}.`);
        return;
      }

      setInvitation(inv);

      if (isLoggedIn && loggedEmail === inv.email?.toLowerCase()) {
        setAuthPath('choose');
      } else {
        setSignupEmail(inv.email || '');
        setLoginEmail(inv.email || '');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load invitation.');
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleAccept = async () => {
    if (!invitation) return;

    setAccepting(true);
    try {
      const redirect = await acceptInvitationForUser(invitation.id, invitation);
      await refreshUserContext();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to accept invitation.');
    } finally {
      setAccepting(false);
    }
  };

  const handleLoginAndAccept = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      Alert.alert('Missing Fields', 'Please enter email and password.');
      return;
    }

    setLoginLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim().toLowerCase(), loginPassword);

      const currentEmail = auth.currentUser?.email?.toLowerCase();
      const inviteEmail = invitation?.email?.toLowerCase();
      if (currentEmail !== inviteEmail) {
        Alert.alert(
          'Email Mismatch',
          `This invitation was sent to ${inviteEmail}. You logged in as ${currentEmail}.`,
          [
            { text: 'Cancel', onPress: () => auth.signOut() },
            { text: 'Accept Anyway', onPress: () => handleAccept() },
          ]
        );
        return;
      }

      await handleAccept();
    } catch (err: any) {
      let message = 'Login failed.';
      if (
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/invalid-login-credentials'
      ) {
        message = 'Invalid email or password.';
      } else if (err.code === 'auth/user-not-found') {
        message = 'No account found with this email.';
      } else if (err?.message) {
        message = err.message;
      }
      Alert.alert('Login Failed', message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignupAndAccept = async () => {
    if (!firstName.trim() || !lastName.trim() || !signupEmail.trim() || !signupPassword) {
      Alert.alert('Missing Fields', 'Please fill in all required fields.');
      return;
    }

    const pwError = validatePassword(signupPassword);
    if (pwError) {
      Alert.alert('Weak Password', pwError);
      return;
    }

    setSignupLoading(true);
    try {
      const normalized = signupEmail.trim().toLowerCase();
      const existing = await findUserByEmail(normalized);

      if (existing.exists && existing.userData?.emailVerified) {
        Alert.alert('Account Exists', 'An account with this email already exists. Please use "Login" instead.');
        setAuthPath('login');
        setLoginEmail(signupEmail);
        return;
      }

      try {
        await createUserWithEmailAndPassword(auth, normalized, signupPassword);
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          await signInWithEmailAndPassword(auth, normalized, signupPassword);
        } else {
          throw authErr;
        }
      }

      await handleAccept();
    } catch (err: any) {
      Alert.alert('Signup Failed', err?.message || 'Something went wrong.');
    } finally {
      setSignupLoading(false);
    }
  };

  if (loadingInvite) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading invitation...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <View style={styles.errorIcon}>
          <Text style={{ fontSize: 36 }}>⚠️</Text>
        </View>
        <Text style={styles.errorTitle}>Invalid Invitation</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => {
            AsyncStorage.removeItem('pendingInvitationId');
            setAuthRoute('login');
            router.replace('/(auth)/login');
          }}
        >
          <Text style={styles.primaryBtnText}>Back to Login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.inviteHeader}>
          <View style={styles.inviteIconCircle}>
            <Text style={{ fontSize: 32 }}>🎉</Text>
          </View>
          <Text style={styles.inviteTitle}>You're Invited!</Text>
          <Text style={styles.inviteSubtitle}>
            You've been invited to join{' '}
            <Text style={{ fontWeight: '600', color: Colors.light.tint }}>
              {invitation?.businessName || 'a business'}
            </Text>{' '}
            as a <Text style={{ fontWeight: '600' }}>{invitation?.role}</Text>.
          </Text>
        </View>

        {isLoggedIn && loggedEmail === (invitation?.email || '').toLowerCase() ? (
          <View style={styles.section}>
            <Text style={styles.sectionDesc}>
              You're signed in as <Text style={{ fontWeight: '600' }}>{loggedEmail}</Text>. Tap below to accept.
            </Text>
            <Pressable
              style={[styles.primaryBtn, accepting && styles.disabled]}
              onPress={handleAccept}
              disabled={accepting}
            >
              {accepting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Accept Invitation</Text>
              )}
            </Pressable>
          </View>
        ) : isLoggedIn && loggedEmail !== (invitation?.email || '').toLowerCase() ? (
          <View style={styles.section}>
            <View style={styles.mismatchBanner}>
              <Text style={styles.mismatchText}>
                You're signed in as <Text style={{ fontWeight: '600' }}>{loggedEmail}</Text>, but this invitation
                was sent to <Text style={{ fontWeight: '600' }}>{invitation?.email}</Text>.
              </Text>
            </View>
            <Pressable style={styles.secondaryBtn} onPress={() => signOut()}>
              <Text style={styles.secondaryBtnText}>Sign Out & Continue</Text>
            </Pressable>
          </View>
        ) : authPath === 'choose' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How would you like to continue?</Text>

            <Pressable
              style={styles.choiceCard}
              onPress={() => { setAuthPath('signup'); setSignupEmail(invitation?.email || ''); }}
            >
              <Text style={styles.choiceTitle}>Create an Account</Text>
              <Text style={styles.choiceDesc}>I'm new to BookingPenguin</Text>
            </Pressable>

            <Pressable
              style={styles.choiceCard}
              onPress={() => { setAuthPath('login'); setLoginEmail(invitation?.email || ''); }}
            >
              <Text style={styles.choiceTitle}>Log In</Text>
              <Text style={styles.choiceDesc}>I already have an account</Text>
            </Pressable>
          </View>
        ) : authPath === 'login' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sign In to Accept</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={loginEmail}
                onChangeText={setLoginEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loginLoading}
                placeholderTextColor={Colors.light.textMuted}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={loginPassword}
                onChangeText={setLoginPassword}
                secureTextEntry
                editable={!loginLoading}
                placeholderTextColor={Colors.light.textMuted}
                placeholder="Enter your password"
              />
            </View>
            <Pressable
              style={[styles.primaryBtn, loginLoading && styles.disabled]}
              onPress={handleLoginAndAccept}
              disabled={loginLoading}
            >
              {loginLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Login & Accept</Text>
              )}
            </Pressable>
            <Pressable style={styles.backLink} onPress={() => setAuthPath('choose')}>
              <Text style={styles.backLinkText}>Back</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Create Account & Accept</Text>
            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfInput]}>
                <Text style={styles.label}>First Name *</Text>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  editable={!signupLoading}
                  placeholderTextColor={Colors.light.textMuted}
                />
              </View>
              <View style={[styles.inputGroup, styles.halfInput]}>
                <Text style={styles.label}>Last Name *</Text>
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  editable={!signupLoading}
                  placeholderTextColor={Colors.light.textMuted}
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: '#f1f5f9' }]}
                value={signupEmail}
                editable={false}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                editable={!signupLoading}
                placeholderTextColor={Colors.light.textMuted}
                placeholder="(555) 123-4567"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password *</Text>
              <TextInput
                style={styles.input}
                value={signupPassword}
                onChangeText={setSignupPassword}
                secureTextEntry
                editable={!signupLoading}
                placeholderTextColor={Colors.light.textMuted}
                placeholder="At least 8 characters"
              />
            </View>
            <Pressable
              style={[styles.primaryBtn, signupLoading && styles.disabled]}
              onPress={handleSignupAndAccept}
              disabled={signupLoading}
            >
              {signupLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Sign Up & Accept</Text>
              )}
            </Pressable>
            <Pressable style={styles.backLink} onPress={() => setAuthPath('choose')}>
              <Text style={styles.backLinkText}>Back</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={styles.cancelLink}
          onPress={() => {
            AsyncStorage.removeItem('pendingInvitationId');
            setAuthRoute('login');
            router.replace('/(auth)/login');
          }}
        >
          <Text style={styles.cancelText}>Cancel & Return to Login</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: Colors.light.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  errorIcon: {
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
    maxWidth: 300,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
  },
  inviteHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  inviteIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  inviteTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 8,
  },
  inviteSubtitle: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  sectionDesc: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  mismatchBanner: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  mismatchText: {
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
    textAlign: 'center',
  },
  choiceCard: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 14,
    padding: 20,
    backgroundColor: Colors.light.surface,
    marginBottom: 12,
    alignItems: 'center',
  },
  choiceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  choiceDesc: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 6,
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: { flex: 1 },
  primaryBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
  },
  secondaryBtnText: {
    color: Colors.light.text,
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  backLink: {
    alignItems: 'center',
    marginTop: 16,
    padding: 8,
  },
  backLinkText: {
    color: Colors.light.tint,
    fontSize: 14,
    fontWeight: '500',
  },
  cancelLink: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
    padding: 8,
  },
  cancelText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});
