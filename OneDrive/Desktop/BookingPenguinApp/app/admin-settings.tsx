import React, { useState, useEffect, useMemo } from 'react';
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
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as WebBrowser from 'expo-web-browser';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  linkWithCredential,
} from 'firebase/auth';
import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { auth, db, storage, functions } from '@/services/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  getBusiness,
  updateBusiness,
  getBusinessMembers,
} from '@/services/business';
import {
  createInvitation,
  cancelInvitation,
  subscribeToPendingInvitations,
} from '@/services/invitations';
import Colors from '@/constants/Colors';
import type { BusinessDoc, BusinessMember, InvitationDoc } from '@/types';

type Tab = 'account' | 'business' | 'subscription' | 'team';

const TABS: { key: Tab; label: string; icon: React.ComponentProps<typeof FontAwesome>['name'] }[] = [
  { key: 'account', label: 'Account', icon: 'user' },
  { key: 'business', label: 'Business', icon: 'building' },
  { key: 'subscription', label: 'Plan', icon: 'credit-card' },
  { key: 'team', label: 'Team', icon: 'users' },
];

export default function AdminSettingsScreen() {
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
        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              style={[styles.tab, activeTab === t.key && styles.tabActive]}
              onPress={() => setActiveTab(t.key)}
            >
              <FontAwesome
                name={t.icon}
                size={14}
                color={activeTab === t.key ? Colors.light.tint : Colors.light.textMuted}
              />
              <Text
                style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'account' && <AccountTab />}
        {activeTab === 'business' && <BusinessTab />}
        {activeTab === 'subscription' && <SubscriptionTab />}
        {activeTab === 'team' && <TeamTab />}
      </View>
    </>
  );
}

// ─── Tab A: Account Info ─────────────────────────────────────────────────────

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

  // Password state
  const hasPassword = firebaseUser?.providerData?.some((p) => p.providerId === 'password') ?? false;
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingPhoto(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 256 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      const response = await fetch(manipulated.uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `users/${authUid}/avatar`);
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

  async function handleRemovePhoto() {
    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `users/${authUid}/avatar`);
      await deleteObject(storageRef).catch(() => {});
      await updateDoc(doc(db, 'users', userDocId), { photoUrl: '' });
      setPhotoUrl('');
      await refreshUserContext();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not remove photo.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSaveProfile() {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Required', 'First name and last name are required.');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', userDocId), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });
      await refreshUserContext();
      Alert.alert('Saved', 'Profile updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordAction() {
    if (newPw.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    if (!firebaseUser) return;

    setPwSaving(true);
    try {
      if (hasPassword) {
        if (!currentPw) {
          Alert.alert('Required', 'Please enter your current password.');
          setPwSaving(false);
          return;
        }
        const cred = EmailAuthProvider.credential(firebaseUser.email!, currentPw);
        await reauthenticateWithCredential(firebaseUser, cred);
        await updatePassword(firebaseUser, newPw);
      } else {
        const cred = EmailAuthProvider.credential(firebaseUser.email!, newPw);
        await linkWithCredential(firebaseUser, cred);
      }
      Alert.alert('Success', hasPassword ? 'Password changed.' : 'Password set.');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      const msg = err.code === 'auth/wrong-password' ? 'Current password is incorrect.' : err.message;
      Alert.alert('Error', msg || 'Failed to update password.');
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {/* Profile Photo */}
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
        {photoUrl ? (
          <Pressable onPress={handleRemovePhoto} style={{ marginTop: 8 }}>
            <Text style={{ color: Colors.light.danger, fontSize: 13 }}>Remove Photo</Text>
          </Pressable>
        ) : (
          <Text style={styles.avatarHint}>Tap to upload photo</Text>
        )}
      </View>

      {/* Personal Info */}
      <Text style={styles.sectionTitle}>Personal Info</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <View style={[styles.input, styles.readOnly]}>
          <Text style={styles.readOnlyText}>{userDoc?.email || firebaseUser?.email || ''}</Text>
        </View>
        <Text style={styles.label}>First Name</Text>
        <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor={Colors.light.textMuted} />
        <Text style={styles.label}>Last Name</Text>
        <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor={Colors.light.textMuted} />
        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor={Colors.light.textMuted} keyboardType="phone-pad" />
        <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSaveProfile} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Profile</Text>}
        </Pressable>
      </View>

      {/* Password */}
      <Text style={styles.sectionTitle}>{hasPassword ? 'Change Password' : 'Set Password'}</Text>
      <View style={styles.card}>
        {!hasPassword && <Text style={styles.hint}>You signed in with Google and don't have a password yet.</Text>}
        {hasPassword && (
          <>
            <Text style={styles.label}>Current Password</Text>
            <TextInput style={styles.input} value={currentPw} onChangeText={setCurrentPw} secureTextEntry placeholder="Current password" placeholderTextColor={Colors.light.textMuted} />
          </>
        )}
        <Text style={styles.label}>New Password</Text>
        <TextInput style={styles.input} value={newPw} onChangeText={setNewPw} secureTextEntry placeholder="New password" placeholderTextColor={Colors.light.textMuted} />
        <Text style={styles.label}>Confirm Password</Text>
        <TextInput style={styles.input} value={confirmPw} onChangeText={setConfirmPw} secureTextEntry placeholder="Confirm password" placeholderTextColor={Colors.light.textMuted} />
        <Pressable style={[styles.saveBtn, pwSaving && styles.saveBtnDisabled]} onPress={handlePasswordAction} disabled={pwSaving}>
          {pwSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{hasPassword ? 'Change Password' : 'Set Password'}</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ─── Tab B: Business Info ────────────────────────────────────────────────────

function BusinessTab() {
  const { businessId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [stateProv, setStateProv] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    getBusiness(businessId)
      .then((biz) => {
        if (biz) {
          setName(biz.businessName || biz.name || '');
          setEmail(biz.email || '');
          setPhone(biz.phone || '');
          setStreet(biz.address?.street || '');
          setCity(biz.address?.city || '');
          setStateProv(biz.address?.state || '');
          setZip(biz.address?.zip || '');
          setCountry(biz.address?.country || '');
          setLogoUrl(biz.logoUrl || '');
        }
      })
      .catch(() => Alert.alert('Error', 'Failed to load business info.'))
      .finally(() => setLoading(false));
  }, [businessId]);

  async function handleUploadLogo() {
    if (!businessId) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingLogo(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 512 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const fn = httpsCallable<{ businessId: string; imageBase64: string }, { success: boolean; logoUrl: string }>(
        functions, 'uploadBusinessLogoSecure'
      );
      const res = await fn({ businessId, imageBase64: manipulated.base64! });
      setLogoUrl(res.data.logoUrl);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Could not upload logo.');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleRemoveLogo() {
    if (!businessId) return;
    setUploadingLogo(true);
    try {
      const fn = httpsCallable(functions, 'deleteBusinessLogoSecure');
      await fn({ businessId });
      setLogoUrl('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not remove logo.');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSave() {
    if (!businessId || !name.trim()) {
      Alert.alert('Required', 'Business name is required.');
      return;
    }
    setSaving(true);
    try {
      await updateBusiness(businessId, {
        businessName: name.trim(),
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: { street: street.trim(), city: city.trim(), state: stateProv.trim(), zip: zip.trim(), country: country.trim() },
      });
      Alert.alert('Saved', 'Business settings updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.light.tint} /></View>;
  }

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {/* Logo */}
      <Text style={styles.sectionTitle}>Company Logo</Text>
      <View style={[styles.card, { alignItems: 'center' }]}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logoImage} />
        ) : (
          <View style={styles.logoPlaceholder}>
            <FontAwesome name="building" size={32} color={Colors.light.textMuted} />
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <Pressable style={styles.smallBtn} onPress={handleUploadLogo} disabled={uploadingLogo}>
            {uploadingLogo ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.smallBtnText}>Upload</Text>}
          </Pressable>
          {logoUrl ? (
            <Pressable style={[styles.smallBtn, { backgroundColor: Colors.light.dangerLight }]} onPress={handleRemoveLogo}>
              <Text style={[styles.smallBtnText, { color: Colors.light.danger }]}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Business Info */}
      <Text style={styles.sectionTitle}>General</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Business Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Business name" placeholderTextColor={Colors.light.textMuted} />
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Business email" placeholderTextColor={Colors.light.textMuted} keyboardType="email-address" autoCapitalize="none" />
        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Business phone" placeholderTextColor={Colors.light.textMuted} keyboardType="phone-pad" />
      </View>

      <Text style={styles.sectionTitle}>Address</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Street</Text>
        <TextInput style={styles.input} value={street} onChangeText={setStreet} placeholder="Street" placeholderTextColor={Colors.light.textMuted} />
        <Text style={styles.label}>City</Text>
        <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={Colors.light.textMuted} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Province / State</Text>
            <TextInput style={styles.input} value={stateProv} onChangeText={setStateProv} placeholder="Province" placeholderTextColor={Colors.light.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Postal Code</Text>
            <TextInput style={styles.input} value={zip} onChangeText={setZip} placeholder="Postal code" placeholderTextColor={Colors.light.textMuted} />
          </View>
        </View>
        <Text style={styles.label}>Country</Text>
        <TextInput style={styles.input} value={country} onChangeText={setCountry} placeholder="Country" placeholderTextColor={Colors.light.textMuted} />
      </View>

      <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Business Info</Text>}
      </Pressable>
    </ScrollView>
  );
}

// ─── Tab C: Subscription ─────────────────────────────────────────────────────

function resolvePlanName(sub: any): string {
  const product = sub.items?.[0]?.price?.product;
  if (typeof product === 'object' && product?.name) return product.name;
  if (typeof product === 'string') {
    const lower = product.toLowerCase();
    if (lower.includes('premium')) return 'Premium';
    if (lower.includes('pro')) return 'Pro';
    if (lower.includes('starter')) return 'Starter';
  }
  const nickname = sub.items?.[0]?.price?.nickname || sub.items?.[0]?.plan?.nickname || '';
  if (nickname) {
    const n = nickname.toLowerCase();
    if (n.includes('premium')) return 'Premium';
    if (n.includes('pro')) return 'Pro';
    if (n.includes('starter')) return 'Starter';
    return nickname;
  }
  const role = sub.role || sub.metadata?.plan || '';
  if (role) {
    const r = role.toLowerCase();
    if (r.includes('premium')) return 'Premium';
    if (r.includes('pro')) return 'Pro';
    if (r.includes('starter')) return 'Starter';
    return role;
  }
  return 'Active Plan';
}

function SubscriptionTab() {
  const { firebaseUser, businessId } = useAuth();
  const authUid = firebaseUser?.uid || '';
  const [planName, setPlanName] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authUid) return;
    const q = query(
      collection(db, 'customers', authUid, 'subscriptions'),
      where('status', 'in', ['active', 'trialing', 'past_due'])
    );
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setPlanName(null);
        setPlanStatus('none');
      } else {
        const sub = snap.docs[0].data();
        setPlanName(resolvePlanName(sub));
        setPlanStatus(sub.status || 'active');
      }
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [authUid]);

  async function handleManageBilling() {
    try {
      const createPortalLink = httpsCallable<{ returnUrl: string }, { url: string }>(
        functions,
        'ext-firestore-stripe-payments-createPortalLink'
      );
      const { data } = await createPortalLink({ returnUrl: 'https://www.bookingpenguin.com' });
      if (data.url) await WebBrowser.openBrowserAsync(data.url);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not open billing portal.');
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.light.tint} /></View>;
  }

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.sectionTitle}>Current Plan</Text>
      <View style={styles.card}>
        {planName ? (
          <>
            <Text style={styles.planName}>{planName}</Text>
            <Text style={styles.planStatus}>Status: {planStatus}</Text>
          </>
        ) : (
          <Text style={styles.planName}>No active subscription</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Plans</Text>
      {[
        { name: 'Starter', price: '$29/mo', features: ['3 active services', '5 staff', '100 bookings/mo', '1 admin seat'] },
        { name: 'Pro', price: '$59/mo', features: ['10 active services', '15 staff', '500 bookings/mo', '3 admin seats', '50 gallery photos'] },
        { name: 'Premium', price: '$99/mo', features: ['25 active services', '50 staff', 'Unlimited bookings', '10 admin seats', '100 gallery photos', 'AI Analyst'] },
      ].map((p) => (
        <View key={p.name} style={styles.planCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.planCardName}>{p.name}</Text>
            <Text style={styles.planCardPrice}>{p.price}</Text>
          </View>
          {p.features.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <FontAwesome name="check" size={10} color={Colors.light.success} />
              <Text style={styles.planFeature}>{f}</Text>
            </View>
          ))}
        </View>
      ))}

      <Pressable style={styles.saveBtn} onPress={handleManageBilling}>
        <Text style={styles.saveBtnText}>Manage Billing</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Tab D: Team Members ─────────────────────────────────────────────────────

function TeamTab() {
  const { businessId, role, userDoc } = useAuth();
  const isOwner = role === 'owner';
  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [invitations, setInvitations] = useState<InvitationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    getBusinessMembers(businessId)
      .then((all) => {
        const adminsOwners = all.filter(
          (m) => m.membership?.role === 'admin' || m.membership?.role === 'owner'
        );
        setMembers(adminsOwners);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    const unsub = subscribeToPendingInvitations(
      businessId,
      'admin',
      (inv) => setInvitations(inv),
      () => {}
    );
    return unsub;
  }, [businessId]);

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !businessId) return;
    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    setInviting(true);
    try {
      const inviterName = userDoc ? `${userDoc.firstName} ${userDoc.lastName}`.trim() : undefined;
      await createInvitation({ email, role: 'admin', businessId, inviterName });
      Alert.alert('Invitation Sent', `Sent to ${email}.`);
      setInviteEmail('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send invitation.');
    } finally {
      setInviting(false);
    }
  }

  async function handleCancel(inv: InvitationDoc) {
    try {
      await cancelInvitation(inv.id);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to cancel.');
    }
  }

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={Colors.light.tint} /></View>;
  }

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.sectionTitle}>Admins & Owners</Text>
      {members.map((m) => (
        <View key={m.id} style={styles.memberCard}>
          {m.photoUrl ? (
            <Image source={{ uri: m.photoUrl }} style={styles.memberPhoto} />
          ) : (
            <View style={styles.memberPhotoPlaceholder}>
              <Text style={styles.memberPhotoText}>
                {(m.firstName?.[0] || '').toUpperCase()}{(m.lastName?.[0] || '').toUpperCase()}
              </Text>
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
      ))}

      {/* Invite Admin (owner only) */}
      {isOwner && (
        <>
          <Text style={styles.sectionTitle}>Invite Admin</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={Colors.light.textMuted}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Pressable style={[styles.saveBtn, inviting && styles.saveBtnDisabled]} onPress={handleInvite} disabled={inviting}>
              {inviting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Send Invitation</Text>}
            </Pressable>
          </View>
        </>
      )}

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pending Invitations</Text>
          {invitations.map((inv) => (
            <View key={inv.id} style={styles.invCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.invEmail}>{inv.email}</Text>
                <Text style={styles.invRole}>Role: Admin</Text>
              </View>
              <Pressable onPress={() => handleCancel(inv)} hitSlop={8}>
                <FontAwesome name="times-circle" size={20} color={Colors.light.danger} />
              </Pressable>
            </View>
          ))}
        </>
      )}
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
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    gap: 3,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.light.tint },
  tabLabel: { fontSize: 11, fontWeight: '500', color: Colors.light.textMuted },
  tabLabelActive: { color: Colors.light.tint, fontWeight: '700' },

  tabContent: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
    marginTop: 12,
  },
  input: {
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    fontSize: 15,
    color: Colors.light.text,
  },
  readOnly: { backgroundColor: Colors.light.borderLight, justifyContent: 'center' },
  readOnlyText: { fontSize: 15, color: Colors.light.textMuted },
  hint: { fontSize: 12, color: Colors.light.textMuted, marginBottom: 8 },

  saveBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 8 },
  avatarImage: { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.light.border },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.light.tint + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: { fontSize: 28, fontWeight: '700', color: Colors.light.tint },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.light.surface,
  },
  avatarHint: { fontSize: 12, color: Colors.light.textMuted, marginTop: 6 },

  // Logo
  logoImage: { width: 100, height: 100, borderRadius: 12, backgroundColor: Colors.light.border },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: Colors.light.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
  },
  smallBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Plan
  planName: { fontSize: 20, fontWeight: '700', color: Colors.light.text },
  planStatus: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 4, textTransform: 'capitalize' },
  planCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  planCardName: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  planCardPrice: { fontSize: 15, fontWeight: '600', color: Colors.light.tint },
  planFeature: { fontSize: 13, color: Colors.light.textSecondary },

  // Team
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  memberPhoto: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.light.border },
  memberPhotoPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.light.tint + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberPhotoText: { fontSize: 15, fontWeight: '700', color: Colors.light.tint },
  memberNameText: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  memberEmailText: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 1 },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.light.tint + '18',
    borderRadius: 6,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.light.tint },
  invCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  invEmail: { fontSize: 14, fontWeight: '500', color: Colors.light.text },
  invRole: { fontSize: 12, color: Colors.light.textMuted, marginTop: 2 },
});
