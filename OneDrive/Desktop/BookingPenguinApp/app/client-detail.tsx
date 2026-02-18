import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToBookings, getStatusInfo } from '@/services/bookings';
import Colors from '@/constants/Colors';
import type { BookingDoc } from '@/types';

type Tab = 'all' | 'upcoming' | 'completed' | 'cancelled';

export default function ClientDetailScreen() {
  const { clientId, clientEmail, clientName } =
    useLocalSearchParams<{ clientId: string; clientEmail: string; clientName: string }>();
  const { businessId } = useAuth();
  const [allBookings, setAllBookings] = useState<BookingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('all');

  useEffect(() => {
    if (!businessId) return;
    const unsub = subscribeToBookings(businessId, (bks) => {
      setAllBookings(bks);
      setLoading(false);
    });
    return unsub;
  }, [businessId]);

  const clientBookings = useMemo(() => {
    const email = clientEmail?.toLowerCase();
    return allBookings
      .filter(
        (b) =>
          b.clientId === clientId ||
          (email && b.customer?.email?.toLowerCase() === email)
      )
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [allBookings, clientId, clientEmail]);

  const today = new Date().toISOString().split('T')[0];

  const stats = useMemo(() => {
    const total = clientBookings.length;
    const upcoming = clientBookings.filter(
      (b) => b.date >= today && b.status !== 'cancelled' && b.status !== 'completed'
    ).length;
    const completed = clientBookings.filter((b) => b.status === 'completed').length;
    const pending = clientBookings.filter((b) => b.status === 'pending').length;
    const totalSpent = clientBookings
      .filter((b) => b.status !== 'cancelled')
      .reduce((sum, b) => sum + (b.pricing?.total || 0), 0);

    return { total, upcoming, completed, pending, totalSpent };
  }, [clientBookings, today]);

  const filteredBookings = useMemo(() => {
    switch (activeTab) {
      case 'upcoming':
        return clientBookings.filter(
          (b) => b.date >= today && b.status !== 'cancelled' && b.status !== 'completed'
        );
      case 'completed':
        return clientBookings.filter((b) => b.status === 'completed');
      case 'cancelled':
        return clientBookings.filter((b) => b.status === 'cancelled');
      default:
        return clientBookings;
    }
  }, [clientBookings, activeTab, today]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, BookingDoc[]> = {};
    filteredBookings.forEach((b) => {
      const key = b.date || 'No date';
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredBookings]);

  const firstBooking = clientBookings[clientBookings.length - 1];
  const customerInfo = firstBooking?.customer;

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: clientName || 'Client',
            headerStyle: { backgroundColor: Colors.light.headerBg },
            headerTintColor: Colors.light.headerText,
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
          title: clientName || 'Client',
          headerStyle: { backgroundColor: Colors.light.headerBg },
          headerTintColor: Colors.light.headerText,
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Client Info */}
        <View style={styles.profileSection}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileInitials}>
              {(clientName || '??')
                .split(' ')
                .map((w) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </Text>
          </View>
          <Text style={styles.profileName}>{clientName}</Text>
          {customerInfo?.email && (
            <View style={styles.contactRow}>
              <FontAwesome name="envelope" size={12} color={Colors.light.textMuted} />
              <Text style={styles.contactText}>{customerInfo.email}</Text>
            </View>
          )}
          {customerInfo?.phone && (
            <View style={styles.contactRow}>
              <FontAwesome name="phone" size={12} color={Colors.light.textMuted} />
              <Text style={styles.contactText}>{customerInfo.phone}</Text>
            </View>
          )}
        </View>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.tint }]}>
              {stats.upcoming}
            </Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.success }]}>
              {stats.completed}
            </Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.light.warning }]}>
              {stats.pending}
            </Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
        </View>

        {/* Revenue Card */}
        <View style={styles.revenueCard}>
          <Text style={styles.revenueLabel}>Total Revenue from Client</Text>
          <Text style={styles.revenueAmount}>${stats.totalSpent.toFixed(2)}</Text>
        </View>

        {/* Filter Tabs */}
        <View style={styles.tabBar}>
          {([
            { key: 'all' as Tab, label: 'All' },
            { key: 'upcoming' as Tab, label: 'Upcoming' },
            { key: 'completed' as Tab, label: 'Completed' },
            { key: 'cancelled' as Tab, label: 'Cancelled' },
          ]).map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Bookings */}
        {filteredBookings.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome name="calendar-o" size={36} color={Colors.light.textMuted} />
            <Text style={styles.emptyText}>No bookings found</Text>
          </View>
        ) : (
          groupedByDate.map(([date, bookings]) => {
            const isToday = date === today;
            let dateLabel: string;
            try {
              dateLabel = format(new Date(date + 'T12:00:00'), 'EEEE, MMMM d, yyyy');
            } catch {
              dateLabel = date;
            }

            return (
              <View key={date}>
                <View style={styles.dateHeader}>
                  <Text style={styles.dateText}>{dateLabel}</Text>
                  {isToday && (
                    <View style={styles.todayBadge}>
                      <Text style={styles.todayText}>TODAY</Text>
                    </View>
                  )}
                </View>
                {bookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))}
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

function BookingCard({ booking }: { booking: BookingDoc }) {
  const { label, colorKey } = getStatusInfo(booking.status);
  const statusColor = Colors.light[colorKey];

  const clientLabel: Record<string, string> = {
    pending: 'Pending Confirmation',
    assigned: 'Staff Assigned',
    accepted: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return (
    <Pressable
      style={[styles.bookingCard, { borderLeftColor: statusColor }]}
      onPress={() =>
        router.push({ pathname: '/booking-detail', params: { bookingId: booking.id } })
      }
    >
      <View style={styles.bookingTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bookingService} numberOfLines={1}>
            {booking.serviceName}
          </Text>
          <View style={styles.bookingMeta}>
            {booking.time && <Text style={styles.bookingTime}>{booking.time}</Text>}
            {booking.assignedToName && (
              <Text style={styles.bookingStaff}>
                <FontAwesome name="user-o" size={11} color={Colors.light.textMuted} />{' '}
                {booking.assignedToName}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.bookingRight}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {clientLabel[booking.status] || label}
            </Text>
          </View>
          {booking.pricing?.total != null && (
            <Text style={styles.bookingPrice}>${booking.pricing.total.toFixed(2)}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { paddingBottom: 40 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
  },

  // Profile
  profileSection: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: Colors.light.surface,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  profileInitials: { fontSize: 22, fontWeight: '700', color: '#fff' },
  profileName: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  contactText: { fontSize: 13, color: Colors.light.textSecondary },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  statValue: { fontSize: 20, fontWeight: '700', color: Colors.light.text },
  statLabel: { fontSize: 10, color: Colors.light.textMuted, marginTop: 2, fontWeight: '500' },

  // Revenue
  revenueCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.light.tint,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  revenueLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  revenueAmount: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 4 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: { backgroundColor: Colors.light.tint },
  tabText: { fontSize: 12, fontWeight: '600', color: Colors.light.textSecondary },
  tabTextActive: { color: '#fff' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 48, marginHorizontal: 16 },
  emptyText: { fontSize: 15, color: Colors.light.textMuted, marginTop: 12 },

  // Date groups
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  dateText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
  todayBadge: {
    backgroundColor: Colors.light.tint + '18',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  todayText: { fontSize: 10, fontWeight: '700', color: Colors.light.tint },

  // Booking card
  bookingCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    borderLeftWidth: 4,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  bookingTop: { flexDirection: 'row', justifyContent: 'space-between' },
  bookingService: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  bookingMeta: { flexDirection: 'row', gap: 10, marginTop: 4 },
  bookingTime: { fontSize: 13, color: Colors.light.textSecondary },
  bookingStaff: { fontSize: 13, color: Colors.light.textSecondary },
  bookingRight: { alignItems: 'flex-end', gap: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
  bookingPrice: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
});
