import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Calendar } from 'react-native-calendars';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToBookings, filterBookingsByDate, getStatusInfo } from '@/services/bookings';
import BookingCard from '@/components/BookingCard';
import Colors from '@/constants/Colors';
import type { BookingDoc } from '@/types';

export default function StaffScheduleScreen() {
  const { businessId, userDoc } = useAuth();
  const [allBookings, setAllBookings] = useState<BookingDoc[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const staffId = userDoc?.id;
  const displayName = userDoc
    ? `${userDoc.firstName} ${userDoc.lastName}`.trim()
    : 'Staff';

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

  // Only show bookings assigned to this staff member
  const myBookings = useMemo(
    () => allBookings.filter((b) => b.assignedTo === staffId),
    [allBookings, staffId]
  );

  const todayBookings = useMemo(
    () => filterBookingsByDate(myBookings, format(new Date(), 'yyyy-MM-dd')),
    [myBookings]
  );

  const selectedDayBookings = useMemo(
    () => filterBookingsByDate(myBookings, selectedDate),
    [myBookings, selectedDate]
  );

  // Stats
  const stats = useMemo(() => {
    let upcoming = 0;
    let completed = 0;
    const today = format(new Date(), 'yyyy-MM-dd');
    myBookings.forEach((b) => {
      if (b.status === 'completed') completed++;
      else if (b.date >= today && b.status !== 'cancelled') upcoming++;
    });
    return { total: myBookings.length, today: todayBookings.length, upcoming, completed };
  }, [myBookings, todayBookings]);

  // Calendar dots
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    myBookings.forEach((b) => {
      if (!b.date) return;
      if (!marks[b.date]) marks[b.date] = { dots: [], marked: true };
      const { colorKey } = getStatusInfo(b.status);
      const color = Colors.light[colorKey];
      const existing = marks[b.date].dots.map((d: any) => d.color);
      if (!existing.includes(color)) {
        marks[b.date].dots.push({ key: b.status, color });
      }
    });

    if (marks[selectedDate]) {
      marks[selectedDate] = { ...marks[selectedDate], selected: true, selectedColor: Colors.light.tint };
    } else {
      marks[selectedDate] = { selected: true, selectedColor: Colors.light.tint, dots: [] };
    }
    return marks;
  }, [myBookings, selectedDate]);

  const handleBookingPress = (booking: BookingDoc) => {
    router.push({ pathname: '/booking-detail', params: { bookingId: booking.id } });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading your schedule...</Text>
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
        {/* Welcome */}
        <View style={styles.welcomeCard}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{displayName}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard label="Today" value={stats.today} color={Colors.light.tint} />
          <StatCard label="Upcoming" value={stats.upcoming} color={Colors.light.warning} />
          <StatCard label="Completed" value={stats.completed} color={Colors.light.success} />
        </View>

        {/* Today's Bookings */}
        {todayBookings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Jobs</Text>
            {todayBookings.map((b) => (
              <BookingCard key={b.id} booking={b} onPress={handleBookingPress} />
            ))}
          </View>
        )}

        {/* Calendar */}
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
          <Pressable
            style={styles.goToTodayBtn}
            onPress={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
          >
            <Text style={styles.goToTodayText}>Go to Today</Text>
          </Pressable>
          <View style={styles.legend}>
            <LegendDot color={Colors.light.warning} label="Pending" />
            <LegendDot color={Colors.light.tint} label="Assigned" />
            <LegendDot color={Colors.light.success} label="Completed" />
          </View>
        </View>

        {/* Selected Day */}
        {selectedDayBookings.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {format(parseISO(selectedDate), 'MMMM d, yyyy')}
            </Text>
            {selectedDayBookings.map((b) => (
              <BookingCard key={b.id} booking={b} onPress={handleBookingPress} />
            ))}
          </View>
        ) : (
          <View style={styles.emptySection}>
            <FontAwesome name="calendar-check-o" size={32} color={Colors.light.textMuted} />
            <Text style={styles.emptyText}>
              No jobs on {format(parseISO(selectedDate), 'MMMM d')}
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
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
  container: { flex: 1, backgroundColor: Colors.light.background },
  scrollContent: { paddingBottom: 20 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
  },
  loadingText: { marginTop: 12, fontSize: 14, color: Colors.light.textSecondary },

  welcomeCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  greeting: { fontSize: 14, color: Colors.light.textSecondary },
  name: { fontSize: 22, fontWeight: '700', color: Colors.light.text, marginTop: 2 },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
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
  statLabel: { fontSize: 12, color: Colors.light.textSecondary, fontWeight: '500', marginBottom: 4 },
  statNumber: { fontSize: 22, fontWeight: '700' },

  section: { marginTop: 8 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  calendarSection: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  calendar: { borderRadius: 12 },
  goToTodayBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
  },
  goToTodayText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: Colors.light.textSecondary, fontWeight: '500' },

  emptySection: { alignItems: 'center', paddingVertical: 32, marginHorizontal: 16 },
  emptyText: { fontSize: 14, color: Colors.light.textMuted, marginTop: 10 },
});
