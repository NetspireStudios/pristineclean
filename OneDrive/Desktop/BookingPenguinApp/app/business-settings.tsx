import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { getBusiness, updateBusiness } from '@/services/business';
import Colors from '@/constants/Colors';
import type { BusinessDoc } from '@/types';

export default function BusinessSettingsScreen() {
  const { businessId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [biz, setBiz] = useState<BusinessDoc | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [stateProv, setStateProv] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('');

  useEffect(() => {
    if (!businessId) return;
    getBusiness(businessId)
      .then((doc) => {
        if (doc) {
          setBiz(doc);
          setName(doc.businessName || doc.name || '');
          setEmail(doc.email || '');
          setPhone(doc.phone || '');
          setStreet(doc.address?.street || '');
          setCity(doc.address?.city || '');
          setStateProv(doc.address?.state || '');
          setZip(doc.address?.zip || '');
          setCountry(doc.address?.country || '');
        }
      })
      .catch((err) => Alert.alert('Error', 'Failed to load business info.'))
      .finally(() => setLoading(false));
  }, [businessId]);

  async function handleSave() {
    if (!businessId) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Required', 'Business name is required.');
      return;
    }

    setSaving(true);
    try {
      await updateBusiness(businessId, {
        businessName: trimmedName,
        name: trimmedName,
        email: email.trim(),
        phone: phone.trim(),
        address: {
          street: street.trim(),
          city: city.trim(),
          state: stateProv.trim(),
          zip: zip.trim(),
          country: country.trim(),
        },
      });
      Alert.alert('Saved', 'Business settings updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Business Settings',
            headerStyle: { backgroundColor: Colors.light.headerBg },
            headerTintColor: Colors.light.headerText,
            headerTitleAlign: 'center',
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Business Settings',
          headerStyle: { backgroundColor: Colors.light.headerBg },
          headerTintColor: Colors.light.headerText,
          headerTitleAlign: 'center',
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* General */}
        <Text style={styles.sectionTitle}>General</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Business Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Business name"
            placeholderTextColor={Colors.light.textMuted}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Business email"
            placeholderTextColor={Colors.light.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Business phone"
            placeholderTextColor={Colors.light.textMuted}
            keyboardType="phone-pad"
          />
        </View>

        {/* Address */}
        <Text style={styles.sectionTitle}>Address</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Street</Text>
          <TextInput
            style={styles.input}
            value={street}
            onChangeText={setStreet}
            placeholder="Street address"
            placeholderTextColor={Colors.light.textMuted}
          />

          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="City"
            placeholderTextColor={Colors.light.textMuted}
          />

          <View style={styles.row}>
            <View style={styles.halfCol}>
              <Text style={styles.label}>Province / State</Text>
              <TextInput
                style={styles.input}
                value={stateProv}
                onChangeText={setStateProv}
                placeholder="Province"
                placeholderTextColor={Colors.light.textMuted}
              />
            </View>
            <View style={styles.halfCol}>
              <Text style={styles.label}>Zip / Postal Code</Text>
              <TextInput
                style={styles.input}
                value={zip}
                onChangeText={setZip}
                placeholder="Postal code"
                placeholderTextColor={Colors.light.textMuted}
              />
            </View>
          </View>

          <Text style={styles.label}>Country</Text>
          <TextInput
            style={styles.input}
            value={country}
            onChangeText={setCountry}
            placeholder="Country"
            placeholderTextColor={Colors.light.textMuted}
          />
        </View>

        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 40 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 8,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
    color: Colors.light.text,
  },
  row: { flexDirection: 'row', gap: 12 },
  halfCol: { flex: 1 },
  saveBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
