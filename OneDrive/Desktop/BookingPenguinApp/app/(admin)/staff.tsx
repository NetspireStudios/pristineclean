import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@/contexts/AuthContext';
import { getBusinessMembers } from '@/services/business';
import { updateStaffRate, subscribeToStaffRates } from '@/services/staff';
import {
  createInvitation,
  cancelInvitation,
  subscribeToPendingInvitations,
  checkInviteCooldown,
} from '@/services/invitations';
import Colors from '@/constants/Colors';
import type { BusinessMember, InvitationDoc, StaffRateDoc } from '@/types';

export default function StaffScreen() {
  const { businessId, userDoc } = useAuth();
  const [staff, setStaff] = useState<BusinessMember[]>([]);
  const [rates, setRates] = useState<StaffRateDoc[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InvitationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Rate modal
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<BusinessMember | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    loadStaff();

    const unsubRates = subscribeToStaffRates(businessId, setRates);
    const unsubInvites = subscribeToPendingInvitations(
      businessId,
      'staff',
      setPendingInvites
    );

    return () => {
      unsubRates();
      unsubInvites();
    };
  }, [businessId]);

  async function loadStaff() {
    if (!businessId) return;
    try {
      const members = await getBusinessMembers(businessId, 'staff');
      setStaff(members);
    } catch (err: any) {
      console.error('Failed to load staff:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (!businessId) return;

    const cooldown = await checkInviteCooldown(email);
    if (cooldown.blocked) {
      Alert.alert(
        'Please Wait',
        `An invitation was already sent to ${email}. You can resend in ${cooldown.minutesLeft} minute${cooldown.minutesLeft === 1 ? '' : 's'}.`
      );
      return;
    }

    setInviting(true);
    try {
      const inviterName = userDoc
        ? `${userDoc.firstName} ${userDoc.lastName}`.trim()
        : undefined;
      await createInvitation({ email, role: 'staff', businessId, inviterName });
      Alert.alert('Invitation Sent', `An invitation has been sent to ${email}.`);
      setInviteEmail('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send invitation.');
    } finally {
      setInviting(false);
    }
  }

  async function handleCancelInvite(invite: InvitationDoc) {
    Alert.alert(
      'Cancel Invitation',
      `Cancel the invitation to ${invite.email}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelInvitation(invite.id);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel invitation.');
            }
          },
        },
      ]
    );
  }

  function openRateModal(member: BusinessMember) {
    setSelectedStaff(member);
    const existing = rates.find((r) => r.staffId === member.id);
    setRateInput(existing ? String(existing.hourlyRate) : '');
    setRateModalVisible(true);
  }

  async function handleSaveRate() {
    if (!selectedStaff || !businessId) return;
    const parsed = parseFloat(rateInput);
    if (isNaN(parsed) || parsed < 0 || parsed > 10000) {
      Alert.alert('Invalid Rate', 'Enter a rate between $0 and $10,000.');
      return;
    }

    setSavingRate(true);
    try {
      await updateStaffRate({
        businessId,
        staffId: selectedStaff.id,
        staffName: `${selectedStaff.firstName} ${selectedStaff.lastName}`,
        hourlyRate: parsed,
      });
      setRateModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update rate.');
    } finally {
      setSavingRate(false);
    }
  }

  const rateMap = useMemo(() => {
    const map: Record<string, number> = {};
    rates.forEach((r) => {
      map[r.staffId] = r.hourlyRate;
    });
    return map;
  }, [rates]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading staff...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadStaff();
            }}
            tintColor={Colors.light.tint}
          />
        }
      >
        <Text style={styles.pageTitle}>Staff</Text>

        {/* Invite Section */}
        <View style={styles.inviteCard}>
          <Text style={styles.inviteTitle}>Invite New Staff Member</Text>
          <View style={styles.inviteRow}>
            <TextInput
              style={styles.inviteInput}
              placeholder="Enter email address"
              placeholderTextColor={Colors.light.textMuted}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!inviting}
            />
            <Pressable
              style={({ pressed }) => [
                styles.inviteButton,
                inviting && styles.inviteButtonDisabled,
                pressed && !inviting && styles.inviteButtonPressed,
              ]}
              onPress={handleInvite}
              disabled={inviting}
            >
              {inviting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.inviteButtonText}>Send Invitation</Text>
              )}
            </Pressable>
          </View>
          <Text style={styles.inviteHint}>
            After they accept, you can set their hourly rate from the staff list.
          </Text>
        </View>

        {/* Pending Invitations */}
        {pendingInvites.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PENDING INVITATIONS</Text>
            {pendingInvites.map((invite) => (
              <View key={invite.id} style={styles.inviteCard}>
                <View style={styles.pendingRow}>
                  <View style={styles.pendingInfo}>
                    <FontAwesome name="envelope-o" size={16} color={Colors.light.warning} />
                    <Text style={styles.pendingEmail}>{invite.email}</Text>
                  </View>
                  <Pressable onPress={() => handleCancelInvite(invite)}>
                    <Text style={styles.cancelLink}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Active Staff */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACTIVE STAFF</Text>
          {staff.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome name="users" size={40} color={Colors.light.textMuted} />
              <Text style={styles.emptyTitle}>No active staff members yet.</Text>
              <Text style={styles.emptySubtitle}>
                Send invitations above to add staff.
              </Text>
            </View>
          ) : (
            staff.map((member) => (
              <StaffCard
                key={member.id}
                member={member}
                rate={rateMap[member.id]}
                onSetRate={() => openRateModal(member)}
              />
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Rate Modal */}
      <Modal
        visible={rateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRateModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set Hourly Rate</Text>
            {selectedStaff && (
              <Text style={styles.modalSubtitle}>
                {selectedStaff.firstName} {selectedStaff.lastName}
              </Text>
            )}
            <View style={styles.rateInputRow}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.rateInput}
                placeholder="0.00"
                placeholderTextColor={Colors.light.textMuted}
                value={rateInput}
                onChangeText={setRateInput}
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={styles.perHour}>/hr</Text>
            </View>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setRateModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSaveBtn, savingRate && { opacity: 0.6 }]}
                onPress={handleSaveRate}
                disabled={savingRate}
              >
                {savingRate ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function StaffCard({
  member,
  rate,
  onSetRate,
}: {
  member: BusinessMember;
  rate?: number;
  onSetRate: () => void;
}) {
  const initials = `${member.firstName?.[0] || ''}${member.lastName?.[0] || ''}`.toUpperCase();

  return (
    <View style={styles.memberCard}>
      <View style={styles.memberRow}>
        <View style={[styles.avatar, { backgroundColor: Colors.light.tint }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>
            {member.firstName} {member.lastName}
          </Text>
          <Text style={styles.memberEmail}>{member.email}</Text>
          {rate !== undefined && (
            <Text style={styles.rateText}>${rate.toFixed(2)}/hr</Text>
          )}
        </View>
      </View>
      <Pressable style={styles.setRateBtn} onPress={onSetRate}>
        <Text style={styles.setRateText}>
          {rate !== undefined ? 'Edit Rate' : 'Set Rate'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },

  // Invite card
  inviteCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: 8,
  },
  inviteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 12,
  },
  inviteRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inviteInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Colors.light.text,
    backgroundColor: Colors.light.background,
  },
  inviteButton: {
    height: 44,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.text,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteButtonPressed: {
    opacity: 0.85,
  },
  inviteButtonDisabled: {
    opacity: 0.5,
  },
  inviteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  inviteHint: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 10,
    fontStyle: 'italic',
  },

  // Sections
  section: {
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.textMuted,
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  // Pending invites
  pendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingEmail: {
    fontSize: 14,
    color: Colors.light.text,
  },
  cancelLink: {
    fontSize: 13,
    color: Colors.light.danger,
    fontWeight: '500',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    marginHorizontal: 16,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.light.textMuted,
    marginTop: 4,
  },

  // Member card
  memberCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  memberInfo: {
    marginLeft: 12,
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  memberEmail: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  rateText: {
    fontSize: 13,
    color: Colors.light.success,
    fontWeight: '500',
    marginTop: 2,
  },
  setRateBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
  },
  setRateText: {
    fontSize: 13,
    color: Colors.light.tint,
    fontWeight: '600',
  },

  // Rate modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  rateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 24,
  },
  dollarSign: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.light.text,
  },
  rateInput: {
    width: 100,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 20,
    fontWeight: '600',
    color: Colors.light.text,
    textAlign: 'center',
    backgroundColor: Colors.light.background,
  },
  perHour: {
    fontSize: 16,
    color: Colors.light.textSecondary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  modalSaveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
