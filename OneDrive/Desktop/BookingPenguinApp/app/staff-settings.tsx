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
  Image,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  linkWithCredential,
} from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, db, storage } from '@/services/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getBusiness, getBusinessMembers } from '@/services/business';
import Colors from '@/constants/Colors';
import type { BusinessDoc, BusinessMember } from '@/types';

type Tab = 'account' | 'contact' | 'workspace';

const TABS: { key: Tab; label: string; icon: React.ComponentProps<typeof FontAwesome>['name'] }[] = [
  { key: 'account', label: 'Account', icon: 'user' },
  { key: 'contact', label: 'Admin Contact', icon: 'phone' },
  { key: 'workspace', label: 'Workspace', icon: 'building' },
];

export default function StaffSettingsScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('account');

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Settings',
          headerStyle: { backgroundColor: Colors.light.headerBg },
          headerTintColor: Colors.light.headerText,
          headerTitleAlign: 'center',
        }}
      />
      <View style={styles.container}>
        <View style={styles.tabBar}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              style={[styles.tab, activeTab === t.key && styles.tabActive]}
              onPress={() => setActiveTab(t.key)}
            >
              <FontAwesome name={t.icon} size={14} color={activeTab === t.key ? Colors.light.tint : Colors.light.textMuted} />
              <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'account' && <AccountTab />}
        {activeTab === 'contact' && <AdminContactTab />}
        {activeTab === 'workspace' && <WorkspaceTab />}
      </View>
    </>
  );
}

// ─── Tab A: Account Info (reuses same logic as admin) ────────────────────────

function AccountTab() {
  const { userDoc, firebaseUser, refreshUserContext } = useAuth();
  const [firstName, setFirstName] = useState(userDoc?.firstName || '');
  const [lastName, setLastName] = useState(userDoc?.lastName || '');
  const [phone, setPhone] = useState(userDoc?.phone || '');
  const [photoUrl, setPhotoUrl] = useState(userDoc?.photoUrl || '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const authUid = firebaseUser?.uid || '';
  const userDocId = userDoc?.id || '';
  const initials = (firstName?.[0] || '').toUpperCase() + (lastName?.[0] || '').toUpperCase();

  const hasPassword = firebaseUser?.providerData?.some((p) => p.providerId === 'password') ?? false;
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Required', 'Allow photo library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingPhoto(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(result.assets[0].uri, [{ resize: { width: 256 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
      const response = await fetch(manipulated.uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `users/${authUid}/avatar`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'users', userDocId), { photoUrl: url });
      setPhotoUrl(url);
      await refreshUserContext();
    } catch (err: any) { Alert.alert('Upload Failed', err.message || 'Could not upload photo.'); }
    finally { setUploadingPhoto(false); }
  }

  async function handleRemovePhoto() {
    setUploadingPhoto(true);
    try {
      await deleteObject(ref(storage, `users/${authUid}/avatar`)).catch(() => {});
      await updateDoc(doc(db, 'users', userDocId), { photoUrl: '' });
      setPhotoUrl('');
      await refreshUserContext();
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setUploadingPhoto(false); }
  }

  async function handleSaveProfile() {
    if (!firstName.trim() || !lastName.trim()) { Alert.alert('Required', 'Name fields are required.'); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', userDocId), { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() });
      await refreshUserContext();
      Alert.alert('Saved', 'Profile updated.');
    } catch (err: any) { Alert.alert('Error', err.message); }
    finally { setSaving(false); }
  }

  async function handlePasswordAction() {
    if (newPw.length < 6) { Alert.alert('Weak Password', 'At least 6 characters.'); return; }
    if (newPw !== confirmPw) { Alert.alert('Mismatch', 'Passwords do not match.'); return; }
    if (!firebaseUser) return;
    setPwSaving(true);
    try {
      if (hasPassword) {
        if (!currentPw) { Alert.alert('Required', 'Enter current password.'); setPwSaving(false); return; }
        await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email!, currentPw));
        await updatePassword(firebaseUser, newPw);
      } else {
        await linkWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email!, newPw));
      }
      Alert.alert('Success', hasPassword ? 'Password changed.' : 'Password set.');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      Alert.alert('Error', err.code === 'auth/wrong-password' ? 'Current password is incorrect.' : err.message);
    } finally { setPwSaving(false); }
  }

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={styles.avatarSection}>
        <Pressable onPress={handlePickPhoto} disabled={uploadingPhoto}>
          {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.avatarImage} /> : (
            <View style={styles.avatarPlaceholder}><Text style={styles.avatarInitials}>{initials || 'U'}</Text></View>
          )}
          <View style={styles.cameraBadge}>
            {uploadingPhoto ? <ActivityIndicator size="small" color="#fff" /> : <FontAwesome name="camera" size={12} color="#fff" />}
          </View>
        </Pressable>
        {photoUrl ? (
          <Pressable onPress={handleRemovePhoto} style={{ marginTop: 8 }}><Text style={{ color: Colors.light.danger, fontSize: 13 }}>Remove Photo</Text></Pressable>
        ) : <Text style={styles.avatarHint}>Tap to upload photo</Text>}
      </View>

      <Text style={styles.sectionTitle}>Personal Info</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <View style={[styles.input, styles.readOnly]}><Text style={styles.readOnlyText}>{userDoc?.email || ''}</Text></View>
        <Text style={styles.label}>First Name</Text>
        <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={Colors.light.textMuted} />
        <Text style={styles.label}>Last Name</Text>
        <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={Colors.light.textMuted} />
        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" placeholderTextColor={Colors.light.textMuted} keyboardType="phone-pad" />
        <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSaveProfile} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Profile</Text>}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>{hasPassword ? 'Change Password' : 'Set Password'}</Text>
      <View style={styles.card}>
        {!hasPassword && <Text style={styles.hint}>You signed in with Google and don't have a password yet.</Text>}
        {hasPassword && (<><Text style={styles.label}>Current Password</Text><TextInput style={styles.input} value={currentPw} onChangeText={setCurrentPw} secureTextEntry placeholder="Current password" placeholderTextColor={Colors.light.textMuted} /></>)}
        <Text style={styles.label}>New Password</Text>
        <TextInput style={styles.input} value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="New password" placeholderTextColor={Colors.light.textMuted} />
        <Text style={styles.label}>Confirm Password</Text>
        <TextInput style={styles.input} value={confirmPw} onChangeText={setConfirmPw} secureTextEntry placeholder="Confirm" placeholderTextColor={Colors.light.textMuted} />
        <Pressable style={[styles.saveBtn, pwSaving && styles.saveBtnDisabled]} onPress={handlePasswordAction} disabled={pwSaving}>
          {pwSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{hasPassword ? 'Change Password' : 'Set Password'}</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ─── Tab B: Admin Contact ────────────────────────────────────────────────────

function AdminContactTab() {
  const { businessId } = useAuth();
  const [admins, setAdmins] = useState<BusinessMember[]>([]);
  const [bizName, setBizName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    Promise.all([
      getBusinessMembers(businessId).then((all) =>
        setAdmins(all.filter((m) => m.membership?.role === 'admin' || m.membership?.role === 'owner'))
      ),
      getBusiness(businessId).then((b) => setBizName(b?.businessName || b?.name || '')),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.light.tint} /></View>;

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 40 }}>
      {bizName ? (
        <View style={styles.card}>
          <FontAwesome name="building" size={18} color={Colors.light.tint} style={{ alignSelf: 'center', marginBottom: 8 }} />
          <Text style={{ textAlign: 'center', fontSize: 17, fontWeight: '600', color: Colors.light.text }}>{bizName}</Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Admins & Owners</Text>
      {admins.length === 0 ? (
        <Text style={{ color: Colors.light.textMuted, textAlign: 'center', marginTop: 20 }}>No admins found.</Text>
      ) : (
        admins.map((m) => (
          <View key={m.id} style={styles.memberCard}>
            {m.photoUrl ? <Image source={{ uri: m.photoUrl }} style={styles.memberPhoto} /> : (
              <View style={styles.memberPhotoPlaceholder}>
                <Text style={styles.memberPhotoText}>{(m.firstName?.[0] || '').toUpperCase()}{(m.lastName?.[0] || '').toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.memberNameText}>{m.firstName} {m.lastName}</Text>
              <Text style={styles.memberEmailText}>{m.email}</Text>
            </View>
            <View style={[styles.roleBadge, m.membership?.role === 'owner' && { backgroundColor: Colors.light.warningLight }]}>
              <Text style={[styles.roleBadgeText, m.membership?.role === 'owner' && { color: Colors.light.warning }]}>
                {m.membership?.role === 'owner' ? 'Owner' : 'Admin'}
              </Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ─── Tab C: Workspace ────────────────────────────────────────────────────────

function WorkspaceTab() {
  const { businessId, userDoc, signOut } = useAuth();
  const [bizName, setBizName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    getBusiness(businessId)
      .then((b) => setBizName(b?.businessName || b?.name || ''))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  function handleLeave() {
    Alert.alert(
      'Leave Company',
      'Are you sure you want to leave this company? You will lose access to all its data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!userDoc?.id) return;
              const memberships = (userDoc.memberships || []).filter(
                (m) => m.businessId !== businessId
              );
              await updateDoc(doc(db, 'users', userDoc.id), { memberships });
              await signOut();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to leave.');
            }
          },
        },
      ]
    );
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.light.tint} /></View>;

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.sectionTitle}>Current Workspace</Text>
      <View style={styles.card}>
        <FontAwesome name="building" size={24} color={Colors.light.tint} style={{ alignSelf: 'center', marginBottom: 8 }} />
        <Text style={{ textAlign: 'center', fontSize: 18, fontWeight: '700', color: Colors.light.text }}>{bizName || 'Business'}</Text>
        <Text style={{ textAlign: 'center', fontSize: 13, color: Colors.light.textMuted, marginTop: 4 }}>You are a staff member of this business.</Text>
      </View>

      <Pressable style={styles.dangerBtn} onPress={handleLeave}>
        <FontAwesome name="sign-out" size={16} color={Colors.light.danger} />
        <Text style={styles.dangerBtnText}>Leave Company</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    paddingHorizontal: 4,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 3, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.light.tint },
  tabLabel: { fontSize: 11, fontWeight: '500', color: Colors.light.textMuted },
  tabLabelActive: { color: Colors.light.tint, fontWeight: '700' },
  tabContent: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.light.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  card: { backgroundColor: Colors.light.surface, borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: Colors.light.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10, fontSize: 15, color: Colors.light.text },
  readOnly: { backgroundColor: Colors.light.borderLight, justifyContent: 'center' },
  readOnlyText: { fontSize: 15, color: Colors.light.textMuted },
  hint: { fontSize: 12, color: Colors.light.textMuted, marginBottom: 8 },
  saveBtn: { backgroundColor: Colors.light.tint, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  avatarSection: { alignItems: 'center', marginBottom: 8 },
  avatarImage: { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.light.border },
  avatarPlaceholder: { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.light.success + '20', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 28, fontWeight: '700', color: Colors.light.success },
  cameraBadge: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.light.tint, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: Colors.light.surface },
  avatarHint: { fontSize: 12, color: Colors.light.textMuted, marginTop: 6 },

  memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.surface, borderRadius: 10, padding: 14, marginBottom: 8, gap: 12 },
  memberPhoto: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.light.border },
  memberPhotoPlaceholder: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.light.tint + '20', justifyContent: 'center', alignItems: 'center' },
  memberPhotoText: { fontSize: 15, fontWeight: '700', color: Colors.light.tint },
  memberNameText: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  memberEmailText: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 1 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.light.tint + '18', borderRadius: 6 },
  roleBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.light.tint },

  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.light.dangerLight,
    borderRadius: 10,
    paddingVertical: 16,
    marginTop: 24,
  },
  dangerBtnText: { fontSize: 15, fontWeight: '600', color: Colors.light.danger },
});
