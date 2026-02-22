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
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { getBusinessMembers } from '@/services/business';
import { subscribeToBookings } from '@/services/bookings';
import {
  createInvitation,
  cancelInvitation,
  subscribeToPendingInvitations,
  checkInviteCooldown,
} from '@/services/invitations';
import Colors from '@/constants/Colors';
import type { BusinessMember, InvitationDoc, BookingDoc } from '@/types';

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  authUid: string | null;
  isRegistered: boolean;
  bookings: BookingDoc[];
  totalSpent: number;
  lastBookingDate: string | null;
  upcomingCount: number;
}

type FilterType = 'all' | 'with_bookings' | 'registered' | 'unregistered';

export default function ClientsScreen() {
  const { businessId, userDoc } = useAuth();
  const [knownMembers, setKnownMembers] = useState<BusinessMember[]>([]);
  const [allBookings, setAllBookings] = useState<BookingDoc[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InvitationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    loadMembers();

    const unsubBookings = subscribeToBookings(businessId, (bks) => {
      setAllBookings(bks);
      setLoading(false);
    });
    const unsubInvites = subscribeToPendingInvitations(
      businessId,
      'client',
      setPendingInvites
    );

    return () => {
      unsubBookings();
      unsubInvites();
    };
  }, [businessId]);

  async function loadMembers() {
    if (!businessId) return;
    try {
      // Try fetching client members; also try all members as fallback
      let members: BusinessMember[] = [];
      try {
        members = await getBusinessMembers(businessId, 'client');
      } catch {
        // If client-specific fails, try fetching all and filter
      }
      if (members.length === 0) {
        try {
          const all = await getBusinessMembers(businessId);
          members = all.filter(
            (m) => m.membership?.role === 'client'
          );
        } catch {
          // Cloud function may not support this; that's fine
        }
      }
      setKnownMembers(members);
    } catch (err: any) {
      console.error('Failed to load members:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Build the client list primarily from bookings data
  const clientRows = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    // Build a lookup from known members by email/id/authUid for enrichment
    const memberByEmail: Record<string, BusinessMember> = {};
    const memberById: Record<string, BusinessMember> = {};
    knownMembers.forEach((m) => {
      if (m.email) memberByEmail[m.email.toLowerCase()] = m;
      memberById[m.id] = m;
      if (m.authUid) memberById[m.authUid] = m;
    });

    // Group bookings by client email
    const clientMap = new Map<
      string,
      {
        email: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        clientId: string | null; // Auth UID from any booking
        isRegistered: boolean;
        bookings: BookingDoc[];
        member: BusinessMember | null;
      }
    >();

    allBookings.forEach((b) => {
      const email = b.customer?.email?.toLowerCase();
      if (!email) return;

      if (!clientMap.has(email)) {
        // Look up member data for enrichment
        const member =
          memberByEmail[email] ||
          (b.clientId ? memberById[b.clientId] : null) ||
          null;

        // Determine registration: clientId is set (non-null) means registered user
        const registered =
          !!b.clientId ||
          (b.customer as any)?.isRegistered === true ||
          !!member;

        clientMap.set(email, {
          email,
          firstName: member?.firstName || b.customer.firstName || '',
          lastName: member?.lastName || b.customer.lastName || '',
          phone: member?.phone || b.customer.phone || null,
          clientId: b.clientId || member?.authUid || null,
          isRegistered: registered,
          bookings: [],
          member,
        });
      }

      const entry = clientMap.get(email)!;
      entry.bookings.push(b);

      // If any booking has clientId set, mark as registered
      if (b.clientId && !entry.isRegistered) {
        entry.isRegistered = true;
        entry.clientId = b.clientId;
      }
      if ((b.customer as any)?.isRegistered === true && !entry.isRegistered) {
        entry.isRegistered = true;
      }
    });

    // Also add known members who have no bookings yet
    knownMembers.forEach((m) => {
      const email = m.email?.toLowerCase();
      if (!email || clientMap.has(email)) return;
      clientMap.set(email, {
        email,
        firstName: m.firstName,
        lastName: m.lastName,
        phone: m.phone,
        clientId: m.authUid,
        isRegistered: true,
        bookings: [],
        member: m,
      });
    });

    // Convert to rows
    const rows: ClientRow[] = [];
    clientMap.forEach((c) => {
      const totalSpent = c.bookings
        .filter((b) => b.status !== 'cancelled')
        .reduce((sum, b) => sum + (b.pricing?.total || 0), 0);

      const sorted = [...c.bookings].sort((a, b) =>
        (b.date || '').localeCompare(a.date || '')
      );
      const lastBookingDate = sorted[0]?.date || null;
      const upcomingCount = c.bookings.filter(
        (b) => b.date >= today && b.status !== 'cancelled' && b.status !== 'completed'
      ).length;

      rows.push({
        id: c.member?.id || c.clientId || `client_${c.email}`,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        photoUrl: c.member?.photoUrl || null,
        authUid: c.clientId,
        isRegistered: c.isRegistered,
        bookings: c.bookings,
        totalSpent,
        lastBookingDate,
        upcomingCount,
      });
    });

    rows.sort((a, b) => {
      if (b.lastBookingDate && a.lastBookingDate)
        return b.lastBookingDate.localeCompare(a.lastBookingDate);
      if (b.lastBookingDate) return 1;
      if (a.lastBookingDate) return -1;
      return a.firstName.localeCompare(b.firstName);
    });

    return rows;
  }, [knownMembers, allBookings]);

  const filteredClients = useMemo(() => {
    let list = clientRows;

    if (filter === 'with_bookings') list = list.filter((c) => c.bookings.length > 0);
    else if (filter === 'registered') list = list.filter((c) => c.isRegistered);
    else if (filter === 'unregistered') list = list.filter((c) => !c.isRegistered);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q))
      );
    }

    return list;
  }, [clientRows, filter, searchQuery]);

  const kpis = useMemo(() => {
    const totalClients = clientRows.length;
    const withBookings = clientRows.filter((c) => c.bookings.length > 0).length;
    const totalRevenue = clientRows.reduce((sum, c) => sum + c.totalSpent, 0);
    const today = new Date().toISOString().split('T')[0];
    const totalUpcoming = clientRows.reduce((sum, c) => sum + c.upcomingCount, 0);
    return { totalClients, withBookings, totalRevenue, totalUpcoming };
  }, [clientRows]);

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
      await createInvitation({ email, role: 'client', businessId, inviterName });
      Alert.alert('Invitation Sent', `An invitation has been sent to ${email}.`);
      setInviteEmail('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send invitation.');
    } finally {
      setInviting(false);
    }
  }

  async function handleQuickInvite(email: string) {
    if (!businessId) return;
    const cooldown = await checkInviteCooldown(email);
    if (cooldown.blocked) {
      Alert.alert(
        'Please Wait',
        `An invitation was already sent to ${email}. You can resend in ${cooldown.minutesLeft} minute${cooldown.minutesLeft === 1 ? '' : 's'}.`
      );
      return;
    }
    Alert.alert(
      'Send Invitation',
      `Send an invitation to ${email} to join as a registered client?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Invite',
          onPress: async () => {
            try {
              const inviterName = userDoc
                ? `${userDoc.firstName} ${userDoc.lastName}`.trim()
                : undefined;
              await createInvitation({ email, role: 'client', businessId, inviterName });
              Alert.alert('Invitation Sent', `Invitation sent to ${email}.`);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to send invitation.');
            }
          },
        },
      ]
    );
  }

  async function handleCancelInvite(invite: InvitationDoc) {
    Alert.alert('Cancel Invitation', `Cancel the invitation to ${invite.email}?`, [
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
    ]);
  }

  const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All Clients' },
    { key: 'with_bookings', label: 'With Bookings' },
    { key: 'registered', label: 'Registered' },
    { key: 'unregistered', label: 'Unregistered' },
  ];
  const filterLabel = FILTER_OPTIONS.find((f) => f.key === filter)?.label || 'All Clients';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading clients...</Text>
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
              loadMembers();
            }}
            tintColor={Colors.light.tint}
          />
        }
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Clients</Text>
          <Pressable
            style={styles.filterDropdown}
            onPress={() => setShowFilterMenu(!showFilterMenu)}
          >
            <Text style={styles.filterDropdownText}>{filterLabel}</Text>
            <FontAwesome name="chevron-down" size={10} color={Colors.light.textSecondary} />
          </Pressable>
        </View>

        {showFilterMenu && (
          <View style={styles.filterMenu}>
            {FILTER_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.filterOption, filter === opt.key && styles.filterOptionActive]}
                onPress={() => {
                  setFilter(opt.key);
                  setShowFilterMenu(false);
                }}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    filter === opt.key && styles.filterOptionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* KPI Stats */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{kpis.totalClients}</Text>
            <Text style={styles.kpiLabel}>Total Clients</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiValue, { color: Colors.light.tint }]}>
              {kpis.withBookings}
            </Text>
            <Text style={styles.kpiLabel}>With Bookings</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiValue, { color: Colors.light.success }]}>
              ${kpis.totalRevenue.toFixed(0)}
            </Text>
            <Text style={styles.kpiLabel}>Total Revenue</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <FontAwesome
            name="search"
            size={14}
            color={Colors.light.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, email, or phone..."
            placeholderTextColor={Colors.light.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <FontAwesome name="times-circle" size={16} color={Colors.light.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Invite Section */}
        <View style={styles.inviteCard}>
          <Text style={styles.inviteTitle}>Invite New Client</Text>
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
                pressed && !inviting && { opacity: 0.85 },
              ]}
              onPress={handleInvite}
              disabled={inviting}
            >
              {inviting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.inviteButtonText}>Send</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Pending Invitations */}
        {pendingInvites.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              PENDING INVITATIONS ({pendingInvites.length})
            </Text>
            {pendingInvites.map((invite) => (
              <View key={invite.id} style={styles.pendingCard}>
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

        {/* Client List */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {filter === 'all' ? 'ALL CLIENTS' : filterLabel.toUpperCase()} ({filteredClients.length})
          </Text>
          {filteredClients.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome name="user-o" size={40} color={Colors.light.textMuted} />
              <Text style={styles.emptyTitle}>
                {clientRows.length === 0 ? 'No clients yet' : 'No clients match your search'}
              </Text>
              {clientRows.length === 0 && (
                <Text style={styles.emptySubtitle}>
                  Send invitations or create bookings to add clients.
                </Text>
              )}
            </View>
          ) : (
            filteredClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onPress={() =>
                  router.push({
                    pathname: '/client-detail',
                    params: {
                      clientId: client.id,
                      clientEmail: client.email,
                      clientName: `${client.firstName} ${client.lastName}`.trim(),
                    },
                  })
                }
                onQuickInvite={
                  !client.isRegistered ? () => handleQuickInvite(client.email) : undefined
                }
              />
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function ClientCard({
  client,
  onPress,
  onQuickInvite,
}: {
  client: ClientRow;
  onPress: () => void;
  onQuickInvite?: () => void;
}) {
  const initials =
    `${client.firstName?.[0] || ''}${client.lastName?.[0] || ''}`.toUpperCase() || '?';
  const avatarColors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
  const colorIndex = (client.firstName?.charCodeAt(0) || 0) % avatarColors.length;

  let lastDateLabel = 'No bookings';
  if (client.lastBookingDate) {
    try {
      lastDateLabel = format(new Date(client.lastBookingDate + 'T12:00:00'), 'MMM d, yyyy');
    } catch {
      lastDateLabel = client.lastBookingDate;
    }
  }

  return (
    <Pressable style={styles.clientCard} onPress={onPress}>
      <View style={styles.clientRow}>
        <View style={[styles.avatar, { backgroundColor: avatarColors[colorIndex] }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.clientInfo}>
          <View style={styles.clientNameRow}>
            <Text style={styles.clientName} numberOfLines={1}>
              {client.firstName} {client.lastName}
            </Text>
          </View>
          <Text style={styles.clientEmail} numberOfLines={1}>
            {client.email}
          </Text>
          {client.phone ? (
            <Text style={styles.clientPhone}>{client.phone}</Text>
          ) : null}
        </View>
        <FontAwesome name="chevron-right" size={12} color={Colors.light.textMuted} />
      </View>

      <View style={styles.clientFooter}>
        <View style={styles.clientStat}>
          <FontAwesome name="calendar" size={11} color={Colors.light.textMuted} />
          <Text style={styles.clientStatText}>
            {client.bookings.length} booking{client.bookings.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.clientStat}>
          <FontAwesome name="clock-o" size={11} color={Colors.light.textMuted} />
          <Text style={styles.clientStatText}>{lastDateLabel}</Text>
        </View>
        {client.totalSpent > 0 && (
          <View style={styles.clientStat}>
            <FontAwesome name="dollar" size={11} color={Colors.light.success} />
            <Text style={[styles.clientStatText, { color: Colors.light.success, fontWeight: '600' }]}>
              {client.totalSpent.toFixed(2)}
            </Text>
          </View>
        )}
        {client.upcomingCount > 0 && (
          <View style={styles.upcomingBadge}>
            <Text style={styles.upcomingBadgeText}>{client.upcomingCount} upcoming</Text>
          </View>
        )}
        {/* Invite button for unregistered clients */}
        {onQuickInvite && (
          <Pressable
            style={styles.inviteChip}
            onPress={(e) => {
              e.stopPropagation?.();
              onQuickInvite();
            }}
          >
            <FontAwesome name="envelope" size={11} color="#fff" />
            <Text style={styles.inviteChipText}>Send Invite</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  scrollContent: { paddingBottom: 20 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
  },
  loadingText: { marginTop: 12, fontSize: 14, color: Colors.light.textSecondary },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  pageTitle: { fontSize: 24, fontWeight: '700', color: Colors.light.text },

  filterDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.light.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  filterDropdownText: { fontSize: 13, color: Colors.light.text, fontWeight: '500' },
  filterMenu: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: 'hidden',
  },
  filterOption: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  filterOptionActive: { backgroundColor: Colors.light.tint + '12' },
  filterOptionText: { fontSize: 14, color: Colors.light.text },
  filterOptionTextActive: { color: Colors.light.tint, fontWeight: '600' },

  // KPI
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiValue: { fontSize: 20, fontWeight: '700', color: Colors.light.text },
  kpiLabel: { fontSize: 11, color: Colors.light.textMuted, marginTop: 2, fontWeight: '500' },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.light.text },

  // Invite
  inviteCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: 8,
  },
  inviteTitle: { fontSize: 15, fontWeight: '600', color: Colors.light.text, marginBottom: 10 },
  inviteRow: { flexDirection: 'row', gap: 8 },
  inviteInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Colors.light.text,
    backgroundColor: Colors.light.background,
  },
  inviteButton: {
    height: 40,
    paddingHorizontal: 18,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteButtonDisabled: { opacity: 0.5 },
  inviteButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Sections
  section: { marginTop: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.textMuted,
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  // Pending
  pendingCard: {
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
  pendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingEmail: { fontSize: 14, color: Colors.light.text },
  cancelLink: { fontSize: 13, color: Colors.light.danger, fontWeight: '500' },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    marginHorizontal: 16,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.light.text, marginTop: 14 },
  emptySubtitle: { fontSize: 13, color: Colors.light.textMuted, marginTop: 4 },

  // Client card
  clientCard: {
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
  clientRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  clientInfo: { marginLeft: 12, flex: 1 },
  clientNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clientName: { fontSize: 15, fontWeight: '600', color: Colors.light.text, flexShrink: 1 },
  clientEmail: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 1 },
  clientPhone: { fontSize: 12, color: Colors.light.textMuted, marginTop: 1 },

  unregBadge: {
    backgroundColor: Colors.light.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  unregBadgeText: { fontSize: 10, fontWeight: '600', color: Colors.light.warning },

  clientFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  clientStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clientStatText: { fontSize: 12, color: Colors.light.textSecondary },

  upcomingBadge: {
    backgroundColor: Colors.light.tint + '14',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  upcomingBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.light.tint },

  inviteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 'auto',
  },
  inviteChipText: { fontSize: 11, fontWeight: '600', color: '#fff' },
});
