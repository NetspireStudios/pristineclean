import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/Colors';

export default function AdminMoreScreen() {
  const { signOut, userDoc, role } = useAuth();

  const initials =
    (userDoc?.firstName?.[0] || '').toUpperCase() +
    (userDoc?.lastName?.[0] || '').toUpperCase();

  const menuItems = [
    { icon: 'bar-chart' as const, label: 'Analytics', onPress: () => router.push('/analytics') },
    { icon: 'wrench' as const, label: 'Services', onPress: () => router.push('/services') },
    { icon: 'comments' as const, label: 'Chat', onPress: () => router.push('/admin-chat') },
    { icon: 'image' as const, label: 'Gallery', onPress: () => router.push('/gallery') },
    { icon: 'cog' as const, label: 'Settings', onPress: () => router.push('/admin-settings') },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* User Info */}
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
          <Text style={styles.userRole}>
            {role === 'owner' ? 'Owner' : 'Admin'}
          </Text>
        </View>
      </View>

      {/* Menu Items */}
      {menuItems.map((item, index) => (
        <Pressable
          key={index}
          style={styles.menuItem}
          onPress={item.onPress}
        >
          <FontAwesome name={item.icon} size={18} color={Colors.light.textSecondary} />
          <Text style={styles.menuLabel}>{item.label}</Text>
          <FontAwesome name="chevron-right" size={12} color={Colors.light.textMuted} />
        </Pressable>
      ))}

      {/* Sign Out */}
      <Pressable style={styles.signOutBtn} onPress={signOut}>
        <FontAwesome name="sign-out" size={18} color={Colors.light.danger} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: 16,
  },
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
  avatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.light.border,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.light.tint + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.tint,
  },
  userInfo: {
    marginLeft: 14,
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
  },
  userEmail: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  userRole: {
    fontSize: 12,
    color: Colors.light.tint,
    fontWeight: '600',
    marginTop: 4,
  },
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
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.danger,
  },
});
