import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { format, addDays } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { createBooking } from '@/services/bookings';
import { subscribeToServices } from '@/services/business';
import Colors from '@/constants/Colors';
import type { ServiceDoc } from '@/types';

type Step = 'service' | 'datetime' | 'customer' | 'confirm';
const STEPS: Step[] = ['service', 'datetime', 'customer', 'confirm'];

export default function CreateBookingScreen() {
  const { businessId } = useAuth();
  const [step, setStep] = useState<Step>('service');
  const [services, setServices] = useState<ServiceDoc[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [selectedService, setSelectedService] = useState<ServiceDoc | null>(null);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!businessId) return;
    const unsub = subscribeToServices(
      businessId,
      (svc) => {
        setServices(svc.filter((s) => s.isActive));
        setLoadingServices(false);
      },
      () => setLoadingServices(false)
    );
    return unsub;
  }, [businessId]);

  const stepIndex = STEPS.indexOf(step);
  const canGoBack = stepIndex > 0;

  const goNext = () => {
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEPS.length) setStep(STEPS[nextIdx]);
  };

  const goBack = () => {
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) setStep(STEPS[prevIdx]);
    else router.back();
  };

  const validateStep = (): boolean => {
    if (step === 'service' && !selectedService) {
      Alert.alert('Select a Service', 'Please choose a service before continuing.');
      return false;
    }
    if (step === 'datetime' && !date) {
      Alert.alert('Select a Date', 'Please pick a date for the booking.');
      return false;
    }
    if (step === 'customer' && !firstName.trim()) {
      Alert.alert('Customer Name', 'Please enter at least a first name.');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) goNext();
  };

  const handleSubmit = async () => {
    if (!businessId || !selectedService) return;

    setSubmitting(true);
    try {
      await createBooking({
        businessId,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        serviceDescription: selectedService.description || '',
        date,
        time: time || null,
        customer: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
        },
        notes: notes.trim(),
        estimatedTimeMinutes: selectedService.estimatedTime || null,
        pricing: selectedService.basePrice
          ? { basePrice: selectedService.basePrice, fieldCharges: 0, extrasTotal: 0, subtotal: selectedService.basePrice, taxRate: 0, tax: 0, total: selectedService.basePrice }
          : null,
      });

      Alert.alert('Booking Created', 'The booking has been added to the schedule.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create booking.');
    } finally {
      setSubmitting(false);
    }
  };

  // Generate next 14 days for quick date picker
  const dateOptions: string[] = [];
  for (let i = 0; i < 14; i++) {
    dateOptions.push(format(addDays(new Date(), i), 'yyyy-MM-dd'));
  }

  const timeSlots = [
    '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM',
    '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM',
    '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM',
    '5:00 PM', '5:30 PM', '6:00 PM',
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'New Booking',
          headerStyle: { backgroundColor: Colors.light.headerBg },
          headerTintColor: Colors.light.headerText,
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Progress Bar */}
        <View style={styles.progressBar}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={[styles.progressDot, i <= stepIndex && styles.progressDotActive]}
            />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Step 1: Select Service */}
          {step === 'service' && (
            <View>
              <Text style={styles.stepTitle}>Select a Service</Text>
              {loadingServices ? (
                <ActivityIndicator color={Colors.light.tint} style={{ marginTop: 40 }} />
              ) : services.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No active services found. Create services on the web app first.</Text>
                </View>
              ) : (
                services.map((svc) => (
                  <Pressable
                    key={svc.id}
                    style={[
                      styles.serviceCard,
                      selectedService?.id === svc.id && styles.serviceCardSelected,
                    ]}
                    onPress={() => setSelectedService(svc)}
                  >
                    <View style={styles.serviceInfo}>
                      <Text style={styles.serviceName}>{svc.name}</Text>
                      {svc.description ? (
                        <Text style={styles.serviceDesc} numberOfLines={2}>{svc.description}</Text>
                      ) : null}
                    </View>
                    {svc.basePrice != null && (
                      <Text style={styles.servicePrice}>${svc.basePrice}</Text>
                    )}
                    {selectedService?.id === svc.id && (
                      <FontAwesome name="check-circle" size={20} color={Colors.light.tint} />
                    )}
                  </Pressable>
                ))
              )}
            </View>
          )}

          {/* Step 2: Date & Time */}
          {step === 'datetime' && (
            <View>
              <Text style={styles.stepTitle}>Pick Date & Time</Text>

              <Text style={styles.fieldLabel}>Date</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
                {dateOptions.map((d) => (
                  <Pressable
                    key={d}
                    style={[styles.dateChip, d === date && styles.dateChipSelected]}
                    onPress={() => setDate(d)}
                  >
                    <Text style={[styles.dateChipDay, d === date && styles.dateChipTextSelected]}>
                      {format(new Date(d + 'T12:00:00'), 'EEE')}
                    </Text>
                    <Text style={[styles.dateChipNum, d === date && styles.dateChipTextSelected]}>
                      {format(new Date(d + 'T12:00:00'), 'd')}
                    </Text>
                    <Text style={[styles.dateChipMonth, d === date && styles.dateChipTextSelected]}>
                      {format(new Date(d + 'T12:00:00'), 'MMM')}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Time (optional)</Text>
              <View style={styles.timeGrid}>
                {timeSlots.map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.timeChip, t === time && styles.timeChipSelected]}
                    onPress={() => setTime(t === time ? '' : t)}
                  >
                    <Text style={[styles.timeChipText, t === time && styles.timeChipTextSelected]}>
                      {t}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Step 3: Customer Info */}
          {step === 'customer' && (
            <View>
              <Text style={styles.stepTitle}>Customer Details</Text>

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>First Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="John"
                    placeholderTextColor={Colors.light.textMuted}
                    value={firstName}
                    onChangeText={setFirstName}
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Doe"
                    placeholderTextColor={Colors.light.textMuted}
                    value={lastName}
                    onChangeText={setLastName}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="customer@email.com"
                placeholderTextColor={Colors.light.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.input}
                placeholder="(555) 123-4567"
                placeholderTextColor={Colors.light.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Any special instructions..."
                placeholderTextColor={Colors.light.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
              />
            </View>
          )}

          {/* Step 4: Confirm */}
          {step === 'confirm' && (
            <View>
              <Text style={styles.stepTitle}>Confirm Booking</Text>

              <View style={styles.confirmCard}>
                <Text style={styles.confirmLabel}>Service</Text>
                <Text style={styles.confirmValue}>{selectedService?.name}</Text>

                <Text style={styles.confirmLabel}>Date</Text>
                <Text style={styles.confirmValue}>
                  {format(new Date(date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
                </Text>

                {time ? (
                  <>
                    <Text style={styles.confirmLabel}>Time</Text>
                    <Text style={styles.confirmValue}>{time}</Text>
                  </>
                ) : null}

                <Text style={styles.confirmLabel}>Customer</Text>
                <Text style={styles.confirmValue}>
                  {`${firstName} ${lastName}`.trim()}
                  {email ? `\n${email}` : ''}
                  {phone ? `\n${phone}` : ''}
                </Text>

                {selectedService?.basePrice != null && (
                  <>
                    <Text style={styles.confirmLabel}>Price</Text>
                    <Text style={styles.confirmValue}>${selectedService.basePrice.toFixed(2)}</Text>
                  </>
                )}

                {notes ? (
                  <>
                    <Text style={styles.confirmLabel}>Notes</Text>
                    <Text style={styles.confirmValue}>{notes}</Text>
                  </>
                ) : null}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Bottom Navigation */}
        <View style={styles.bottomBar}>
          <Pressable style={styles.backBtn} onPress={goBack}>
            <FontAwesome name="arrow-left" size={14} color={Colors.light.textSecondary} />
            <Text style={styles.backBtnText}>{canGoBack ? 'Back' : 'Cancel'}</Text>
          </Pressable>

          {step === 'confirm' ? (
            <Pressable
              style={[styles.nextBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <FontAwesome name="check" size={14} color="#fff" />
                  <Text style={styles.nextBtnText}>Create Booking</Text>
                </>
              )}
            </Pressable>
          ) : (
            <Pressable style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextBtnText}>Next</Text>
              <FontAwesome name="arrow-right" size={14} color="#fff" />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  progressDot: { width: 32, height: 4, borderRadius: 2, backgroundColor: Colors.light.border },
  progressDotActive: { backgroundColor: Colors.light.tint },
  content: { padding: 16, paddingBottom: 100 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: Colors.light.text, marginBottom: 20 },
  // Service cards
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: Colors.light.border,
  },
  serviceCardSelected: { borderColor: Colors.light.tint, backgroundColor: Colors.light.tint + '08' },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 16, fontWeight: '600', color: Colors.light.text },
  serviceDesc: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 4 },
  servicePrice: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginRight: 10 },
  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 14, color: Colors.light.textSecondary, textAlign: 'center' },
  // Date/time
  fieldLabel: { fontSize: 14, fontWeight: '600', color: Colors.light.text, marginBottom: 8, marginTop: 4 },
  dateScroll: { marginBottom: 8 },
  dateChip: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    minWidth: 56,
  },
  dateChipSelected: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  dateChipDay: { fontSize: 11, color: Colors.light.textSecondary, fontWeight: '500' },
  dateChipNum: { fontSize: 18, fontWeight: '700', color: Colors.light.text, marginVertical: 2 },
  dateChipMonth: { fontSize: 11, color: Colors.light.textSecondary },
  dateChipTextSelected: { color: '#ffffff' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  timeChipSelected: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  timeChipText: { fontSize: 13, color: Colors.light.text, fontWeight: '500' },
  timeChipTextSelected: { color: '#ffffff' },
  // Customer form
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: Colors.light.surface,
    marginBottom: 16,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  // Confirm
  confirmCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 20,
  },
  confirmLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textMuted,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 4,
  },
  confirmValue: { fontSize: 15, color: Colors.light.text, lineHeight: 22 },
  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 32,
    backgroundColor: Colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12 },
  backBtnText: { fontSize: 15, color: Colors.light.textSecondary, fontWeight: '500' },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.tint,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  nextBtnText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
});
