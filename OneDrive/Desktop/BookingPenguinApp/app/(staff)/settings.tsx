import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/Colors';

export default function StaffSettingsTab() {
  const { signOut, userDoc } = useAuth();

  const initials =
    (userDoc?.firstName?.[0] || '').toUpperCase() +
    (userDoc?.lastName?.[0] || '').toUpperCase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.userCard}>
        {userDoc?.photoUrl ? (
          <Image source={{ uri: userDoc.photoUrl }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials || 'U'}</Text>
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.userName}>
            {userDoc ? `${userDoc.firstName} ${userDoc.lastName}`.trim() : 'User'}
          </Text>
          <Text style={styles.userEmail}>{userDoc?.email}</Text>
          <Text style={styles.userRole}>Staff</Text>
        </View>
      </View>

      <Pressable style={styles.menuItem} onPress={() => router.push('/staff-settings')}>
        <FontAwesome name="cog" size={18} color={Colors.light.textSecondary} />
        <Text style={styles.menuLabel}>Settings</Text>
        <FontAwesome name="chevron-right" size={12} color={Colors.light.textMuted} />
      </Pressable>

      <Pressable style={styles.signOutBtn} onPress={signOut}>
        <FontAwesome name="sign-out" size={18} color={Colors.light.danger} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  avatarImg: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.light.border },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.light.success + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: Colors.light.success },
  userInfo: { marginLeft: 14, flex: 1 },
  userName: { fontSize: 17, fontWeight: '600', color: Colors.light.text },
  userEmail: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 2 },
  userRole: { fontSize: 12, color: Colors.light.success, fontWeight: '600', marginTop: 4 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
    marginLeft: 14,
    fontWeight: '500',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.dangerLight,
    borderRadius: 10,
    padding: 16,
    marginTop: 20,
    gap: 8,
  },
  signOutText: { fontSize: 16, fontWeight: '600', color: Colors.light.danger },
});
