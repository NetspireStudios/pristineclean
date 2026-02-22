import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as ImagePicker from 'expo-image-picker';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/services/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/Colors';

export default function EditProfileScreen() {
  const { userDoc, firebaseUser, refreshUserContext } = useAuth();

  const [firstName, setFirstName] = useState(userDoc?.firstName || '');
  const [lastName, setLastName] = useState(userDoc?.lastName || '');
  const [phone, setPhone] = useState(userDoc?.phone || '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(userDoc?.photoUrl || '');

  const userDocId = userDoc?.id || '';
  const initials =
    (firstName?.[0] || '').toUpperCase() + (lastName?.[0] || '').toUpperCase();

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow access to your photo library to upload a profile picture.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploadingPhoto(true);

    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const ext = asset.uri.split('.').pop() || 'jpg';
      const storageRef = ref(storage, `profilePhotos/${userDocId}.${ext}`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);

      await updateDoc(doc(db, 'users', userDocId), { photoUrl: url });
      setPhotoUrl(url);
      await refreshUserContext();
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Could not upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    const trimFirst = firstName.trim();
    const trimLast = lastName.trim();

    if (!trimFirst || !trimLast) {
      Alert.alert('Required', 'First name and last name are required.');
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', userDocId), {
        firstName: trimFirst,
        lastName: trimLast,
        phone: phone.trim(),
      });
      await refreshUserContext();
      Alert.alert('Saved', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Edit Profile',
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
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <Pressable onPress={handlePickPhoto} disabled={uploadingPhoto}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>{initials || 'U'}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <FontAwesome name="camera" size={12} color="#fff" />
              )}
            </View>
          </Pressable>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </View>

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.label}>First Name</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
            placeholderTextColor={Colors.light.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Last Name</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
            placeholderTextColor={Colors.light.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number"
            placeholderTextColor={Colors.light.textMuted}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Email</Text>
          <View style={[styles.input, styles.readOnly]}>
            <Text style={styles.readOnlyText}>
              {userDoc?.email || firebaseUser?.email || ''}
            </Text>
          </View>
          <Text style={styles.hint}>
            Email cannot be changed from the app.
          </Text>
        </View>

        {/* Save Button */}
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
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.light.border,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.light.tint + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.light.tint,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.light.surface,
  },
  avatarHint: {
    fontSize: 13,
    color: Colors.light.textMuted,
    marginTop: 8,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
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
  readOnly: {
    backgroundColor: Colors.light.borderLight,
    justifyContent: 'center',
  },
  readOnlyText: {
    fontSize: 16,
    color: Colors.light.textMuted,
  },
  hint: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 4,
  },
  saveBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
