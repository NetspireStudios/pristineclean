import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { deleteAccount } from '@/services/auth';
import { auth, db } from '@/services/firebase';
import Colors from '@/constants/Colors';

export default function WaitingScreen() {
  const { setAuthRoute, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleStartBusiness = () => {
    setAuthRoute('onboarding');
    router.replace('/onboarding');
  };

  const handleCheckInvitations = async () => {
    const email = auth.currentUser?.email?.toLowerCase();
    if (!email) {
      Alert.alert('Error', 'Could not determine your email address.');
      return;
    }

    setChecking(true);
    try {
      const invSnap = await getDocs(
        query(
          collection(db, 'invitations'),
          where('email', '==', email),
          where('status', '==', 'pending')
        )
      );

      if (invSnap.empty) {
        Alert.alert(
          'No Invitations',
          'We didn\'t find any pending invitations for your email. Ask your business admin to send you one.'
        );
        return;
      }

      await AsyncStorage.setItem('pendingInvitationId', invSnap.docs[0].id);
      setAuthRoute('accept-invite');
      router.replace('/accept-invite');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to check invitations.');
    } finally {
      setChecking(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              setAuthRoute('login');
              router.replace('/(auth)/login');
            } catch (error: any) {
              Alert.alert('Error', error?.message || 'Failed to delete account.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      router.replace('/(auth)/login');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>⏳</Text>
        </View>

        <Text style={styles.title}>Welcome!</Text>
        <Text style={styles.subtitle}>
          You don't have an active workspace yet.{'\n'}Choose how you'd like to proceed.
        </Text>

        <View style={styles.options}>
          <Pressable style={styles.optionCard} onPress={handleStartBusiness}>
            <View style={[styles.optionIcon, { backgroundColor: '#eff6ff' }]}>
              <Text style={styles.optionEmoji}>🏢</Text>
            </View>
            <Text style={styles.optionTitle}>Start a Business</Text>
            <Text style={styles.optionDesc}>Create a new company and start managing bookings</Text>
          </Pressable>

          <Pressable
            style={[styles.optionCard, checking && styles.optionDisabled]}
            onPress={handleCheckInvitations}
            disabled={checking}
          >
            <View style={[styles.optionIcon, { backgroundColor: '#f0fdf4' }]}>
              {checking ? (
                <ActivityIndicator color={Colors.light.success} />
              ) : (
                <Text style={styles.optionEmoji}>🔍</Text>
              )}
            </View>
            <Text style={styles.optionTitle}>Check for Invitations</Text>
            <Text style={styles.optionDesc}>Look for pending invitations sent to your email</Text>
          </Pressable>

          <Pressable
            style={[styles.optionCard, styles.dangerCard, deleting && styles.optionDisabled]}
            onPress={handleDeleteAccount}
            disabled={deleting}
          >
            <View style={[styles.optionIcon, { backgroundColor: '#fef2f2' }]}>
              {deleting ? (
                <ActivityIndicator color={Colors.light.danger} />
              ) : (
                <Text style={styles.optionEmoji}>🗑️</Text>
              )}
            </View>
            <Text style={[styles.optionTitle, { color: Colors.light.danger }]}>Delete My Account</Text>
            <Text style={styles.optionDesc}>Permanently remove your account and all data</Text>
          </Pressable>
        </View>

        <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
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
    backgroundColor: '#fffbeb',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: { fontSize: 36 },
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
  options: {
    width: '100%',
    maxWidth: 400,
    gap: 12,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 14,
    padding: 20,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
  },
  optionDisabled: {
    opacity: 0.6,
  },
  dangerCard: {
    borderColor: '#fecaca',
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionEmoji: { fontSize: 22 },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  optionDesc: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  signOutBtn: {
    marginTop: 32,
    padding: 10,
  },
  signOutText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});
