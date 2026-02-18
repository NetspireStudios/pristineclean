import React, { useState } from 'react';
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
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { createBusiness } from '@/services/auth';
import Colors from '@/constants/Colors';

type Step = 'choose' | 1 | 2 | 3;

export default function OnboardingScreen() {
  const { setAuthRoute, refreshUserContext } = useAuth();

  const [step, setStep] = useState<Step>('choose');
  const [loading, setLoading] = useState(false);

  // Business Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bizEmail, setBizEmail] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('Canada');

  const handleStartBusiness = () => setStep(1);

  const handleHaveInvite = () => {
    setAuthRoute('waiting');
    router.replace('/waiting');
  };

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) {
        Alert.alert('Required', 'Please enter your business name.');
        return;
      }
      if (!phone.trim()) {
        Alert.alert('Required', 'Please enter a business phone number.');
        return;
      }
      if (!bizEmail.trim()) {
        Alert.alert('Required', 'Please enter a business email.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!street.trim() || !city.trim() || !province.trim() || !postalCode.trim()) {
        Alert.alert('Required', 'Please fill in all address fields.');
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 1) setStep('choose');
    else if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const handleCreateBusiness = async () => {
    setLoading(true);
    try {
      await createBusiness({
        name,
        phone,
        email: bizEmail,
        street,
        city,
        province,
        postalCode,
        country,
      });

      await refreshUserContext();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to create business.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'choose') {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>🚀</Text>
          </View>
          <Text style={styles.title}>Welcome to BookingPenguin</Text>
          <Text style={styles.subtitle}>How would you like to get started?</Text>

          <Pressable style={styles.choiceCard} onPress={handleStartBusiness}>
            <View style={styles.choiceIcon}>
              <Text style={styles.choiceEmoji}>🏢</Text>
            </View>
            <View style={styles.choiceTextWrap}>
              <Text style={styles.choiceTitle}>Start a Business</Text>
              <Text style={styles.choiceDesc}>
                Create your company profile and start accepting bookings
              </Text>
            </View>
          </Pressable>

          <Pressable style={styles.choiceCard} onPress={handleHaveInvite}>
            <View style={styles.choiceIcon}>
              <Text style={styles.choiceEmoji}>✉️</Text>
            </View>
            <View style={styles.choiceTextWrap}>
              <Text style={styles.choiceTitle}>I Have an Invite</Text>
              <Text style={styles.choiceDesc}>
                Join an existing business with your invitation code
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={styles.logoutBtn}
            onPress={() => {
              setAuthRoute('login');
              router.replace('/(auth)/login');
            }}
          >
            <Text style={styles.logoutText}>Sign Out</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Progress */}
        <View style={styles.progressRow}>
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              style={[
                styles.progressDot,
                s <= (step as number) && styles.progressDotActive,
              ]}
            />
          ))}
        </View>
        <Text style={styles.stepLabel}>
          Step {step as number} of 3 —{' '}
          {step === 1 ? 'Business Info' : step === 2 ? 'Address' : 'Review'}
        </Text>

        {step === 1 && (
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Business Information</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Pristine Clean"
                placeholderTextColor={Colors.light.textMuted}
                value={name}
                onChangeText={setName}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Phone *</Text>
              <TextInput
                style={styles.input}
                placeholder="(555) 123-4567"
                placeholderTextColor={Colors.light.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Email *</Text>
              <TextInput
                style={styles.input}
                placeholder="info@yourbusiness.com"
                placeholderTextColor={Colors.light.textMuted}
                value={bizEmail}
                onChangeText={setBizEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Business Address</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Street *</Text>
              <TextInput
                style={styles.input}
                placeholder="123 Main Street"
                placeholderTextColor={Colors.light.textMuted}
                value={street}
                onChangeText={setStreet}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>City *</Text>
              <TextInput
                style={styles.input}
                placeholder="Toronto"
                placeholderTextColor={Colors.light.textMuted}
                value={city}
                onChangeText={setCity}
              />
            </View>
            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfInput]}>
                <Text style={styles.label}>Province *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ON"
                  placeholderTextColor={Colors.light.textMuted}
                  value={province}
                  onChangeText={setProvince}
                />
              </View>
              <View style={[styles.inputGroup, styles.halfInput]}>
                <Text style={styles.label}>Postal Code *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="M5V 1A1"
                  placeholderTextColor={Colors.light.textMuted}
                  value={postalCode}
                  onChangeText={setPostalCode}
                  autoCapitalize="characters"
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Country</Text>
              <TextInput
                style={styles.input}
                placeholder="Canada"
                placeholderTextColor={Colors.light.textMuted}
                value={country}
                onChangeText={setCountry}
              />
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Review & Confirm</Text>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewLabel}>Business Name</Text>
              <Text style={styles.reviewValue}>{name}</Text>

              <Text style={styles.reviewLabel}>Phone</Text>
              <Text style={styles.reviewValue}>{phone}</Text>

              <Text style={styles.reviewLabel}>Email</Text>
              <Text style={styles.reviewValue}>{bizEmail}</Text>

              <View style={styles.reviewDivider} />

              <Text style={styles.reviewLabel}>Address</Text>
              <Text style={styles.reviewValue}>
                {street}{'\n'}
                {city}, {province} {postalCode}{'\n'}
                {country}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.buttonRow}>
          <Pressable style={styles.backBtn} onPress={handleBack}>
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>

          {step === 3 ? (
            <Pressable
              style={[styles.primaryBtn, loading && styles.buttonDisabled]}
              onPress={handleCreateBusiness}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Create Business</Text>
              )}
            </Pressable>
          ) : (
            <Pressable style={styles.primaryBtn} onPress={handleNext}>
              <Text style={styles.primaryBtnText}>Next</Text>
            </Pressable>
          )}
        </View>
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
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
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
  icon: { fontSize: 36 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 14,
    padding: 20,
    backgroundColor: Colors.light.surface,
    width: '100%',
    maxWidth: 400,
    marginBottom: 14,
  },
  choiceIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  choiceEmoji: { fontSize: 24 },
  choiceTextWrap: { flex: 1 },
  choiceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  choiceDesc: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  logoutBtn: {
    marginTop: 24,
    padding: 8,
  },
  logoutText: {
    color: Colors.light.danger,
    fontSize: 14,
    fontWeight: '500',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  progressDot: {
    width: 32,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.border,
  },
  progressDotActive: {
    backgroundColor: Colors.light.tint,
  },
  stepLabel: {
    textAlign: 'center',
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginBottom: 24,
    fontWeight: '500',
  },
  formSection: {
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.text,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  reviewCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  reviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 12,
  },
  reviewValue: {
    fontSize: 16,
    color: Colors.light.text,
    lineHeight: 22,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  backBtn: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: Colors.light.surface,
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  primaryBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
