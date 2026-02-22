import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Calendar } from 'react-native-calendars';
import { format, parseISO, isAfter, isBefore, addDays } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToBookings, filterBookingsByDate, getStatusInfo } from '@/services/bookings';
import BookingCard from '@/components/BookingCard';
import Colors from '@/constants/Colors';
import type { BookingDoc } from '@/types';

type FilterType = 'all' | 'pending' | 'assigned' | 'accepted' | 'completed';

export default function AdminScheduleScreen() {
  const { businessId, userDoc, role } = useAuth();
  const [allBookings, setAllBookings] = useState<BookingDoc[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentFilter, setRecentFilter] = useState<FilterType>('all');

  useEffect(() => {
    if (!businessId) return;

    const unsub = subscribeToBookings(
      businessId,
      (bookings) => {
        setAllBookings(bookings);
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        console.error('Failed to load bookings:', error);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return unsub;
  }, [businessId]);

  // Overall stats
  const stats = useMemo(() => {
    let pending = 0;
    let assigned = 0;
    let accepted = 0;
    let completed = 0;
    allBookings.forEach((b) => {
      if (b.status === 'pending') pending++;
      else if (b.status === 'confirmed') assigned++;
      else if (b.status === 'in_progress') accepted++;
      else if (b.status === 'completed') completed++;
    });
    return { total: allBookings.length, pending, assigned, accepted, completed };
  }, [allBookings]);

  // Recent bookings (filtered)
  const recentBookings = useMemo(() => {
    let filtered = allBookings;
    if (recentFilter === 'pending') filtered = filtered.filter((b) => b.status === 'pending');
    else if (recentFilter === 'assigned') filtered = filtered.filter((b) => b.status === 'confirmed');
    else if (recentFilter === 'accepted') filtered = filtered.filter((b) => b.status === 'in_progress');
    else if (recentFilter === 'completed') filtered = filtered.filter((b) => b.status === 'completed');
    return filtered.slice(0, 15);
  }, [allBookings, recentFilter]);

  // Calendar marked dates with status-colored dots
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    allBookings.forEach((b) => {
      if (!b.date) return;
      if (!marks[b.date]) {
        marks[b.date] = { dots: [], marked: true };
      }

      const { colorKey } = getStatusInfo(b.status);
      const color = Colors.light[colorKey];

      const existingColors = marks[b.date].dots.map((d: any) => d.color);
      if (!existingColors.includes(color)) {
        marks[b.date].dots.push({ key: b.status, color });
      }
    });

    // Highlight selected date
    if (marks[selectedDate]) {
      marks[selectedDate] = { ...marks[selectedDate], selected: true, selectedColor: Colors.light.tint };
    } else {
      marks[selectedDate] = { selected: true, selectedColor: Colors.light.tint, dots: [] };
    }

    return marks;
  }, [allBookings, selectedDate]);

  // Bookings for selected date on calendar
  const selectedDayBookings = useMemo(
    () => filterBookingsByDate(allBookings, selectedDate),
    [allBookings, selectedDate]
  );

  const handleBookingPress = (booking: BookingDoc) => {
    router.push({ pathname: '/booking-detail', params: { bookingId: booking.id } });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading bookings...</Text>
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
            onRefresh={() => setRefreshing(true)}
            tintColor={Colors.light.tint}
          />
        }
      >
        {/* Header */}
        <Text style={styles.pageTitle}>Schedule</Text>

        {/* Stat Cards */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCardLarge]}>
            <Text style={styles.statLabel}>Total Bookings</Text>
            <Text style={styles.statNumberLarge}>{stats.total}</Text>
          </View>
          <View style={styles.statsRow}>
            <StatCard label="Pending" value={stats.pending} color={Colors.light.warning} />
            <StatCard label="Assigned" value={stats.assigned} color={Colors.light.tint} />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="Accepted" value={stats.accepted} color={Colors.light.tintLight} />
            <StatCard label="Completed" value={stats.completed} color={Colors.light.success} />
          </View>
        </View>

        {/* Recent Bookings Section */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Recent Bookings</Text>
            <Pressable onPress={() => setRefreshing(true)}>
              <Text style={styles.refreshLink}>Refresh</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filterRow}>
              {(['all', 'pending', 'assigned', 'accepted', 'completed'] as FilterType[]).map((f) => (
                <Pressable
                  key={f}
                  style={[styles.filterChip, recentFilter === f && styles.filterChipActive]}
                  onPress={() => setRecentFilter(f)}
                >
                  <Text style={[styles.filterChipText, recentFilter === f && styles.filterChipTextActive]}>
                    {f === 'all' ? 'All Active' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {recentBookings.length === 0 ? (
          <View style={styles.emptySection}>
            <FontAwesome name="calendar-o" size={36} color={Colors.light.textMuted} />
            <Text style={styles.emptyText}>No bookings yet</Text>
          </View>
        ) : (
          <FlatList
            data={recentBookings}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentScroll}
            renderItem={({ item }) => (
              <BookingCard booking={item} onPress={handleBookingPress} compact />
            )}
          />
        )}

        {/* Calendar Section */}
        <View style={styles.calendarSection}>
          <Calendar
            current={selectedDate}
            onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
            markingType="multi-dot"
            markedDates={markedDates}
            theme={{
              backgroundColor: Colors.light.surface,
              calendarBackground: Colors.light.surface,
              textSectionTitleColor: Colors.light.textSecondary,
              selectedDayBackgroundColor: Colors.light.tint,
              selectedDayTextColor: '#ffffff',
              todayTextColor: Colors.light.tint,
              dayTextColor: Colors.light.text,
              textDisabledColor: Colors.light.textMuted,
              arrowColor: Colors.light.tint,
              monthTextColor: Colors.light.text,
              textMonthFontWeight: '600',
              textMonthFontSize: 16,
              textDayFontSize: 14,
              textDayHeaderFontSize: 12,
            }}
            style={styles.calendar}
          />

          {/* Go to Today */}
          <Pressable
            style={styles.goToTodayBtn}
            onPress={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
          >
            <Text style={styles.goToTodayText}>Go to Today</Text>
          </Pressable>

          {/* Legend */}
          <View style={styles.legend}>
            <LegendDot color={Colors.light.warning} label="Pending" />
            <LegendDot color={Colors.light.tint} label="Assigned" />
            <LegendDot color={Colors.light.tintLight} label="Accepted" />
            <LegendDot color={Colors.light.success} label="Completed" />
          </View>
        </View>

        {/* Selected Day Bookings */}
        {selectedDayBookings.length > 0 ? (
          <View style={styles.selectedDaySection}>
            <Text style={styles.selectedDayTitle}>
              {format(parseISO(selectedDate), 'MMMM d, yyyy')}
            </Text>
            {selectedDayBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onPress={handleBookingPress} />
            ))}
          </View>
        ) : (
          <View style={styles.emptySection}>
            <FontAwesome name="calendar-check-o" size={36} color={Colors.light.textMuted} />
            <Text style={styles.emptyText}>
              No bookings on {format(parseISO(selectedDate), 'MMMM d')}
            </Text>
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* FAB - Create Booking */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() =>
          router.push({ pathname: '/create-booking', params: { businessId: businessId || '' } })
        }
      >
        <FontAwesome name="plus" size={22} color="#ffffff" />
      </Pressable>
    </View>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statNumber, { color }]}>{value}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
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

  // Stat cards
  statsGrid: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 20,
  },
  statCardLarge: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: '500',
    marginBottom: 4,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.light.text,
  },
  statNumberLarge: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.light.text,
  },

  // Recent bookings
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
  },
  refreshLink: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.light.tint,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  filterChipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.light.textSecondary,
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  recentScroll: {
    paddingLeft: 16,
    paddingRight: 6,
    paddingBottom: 4,
  },

  // Calendar
  calendarSection: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  calendar: {
    borderRadius: 12,
  },
  goToTodayBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
  },
  goToTodayText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },

  // Selected day
  selectedDaySection: {
    marginTop: 16,
  },
  selectedDayTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  // Empty states
  emptySection: {
    alignItems: 'center',
    paddingVertical: 32,
    marginHorizontal: 16,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.textMuted,
    marginTop: 10,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.light.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  fabPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
});
