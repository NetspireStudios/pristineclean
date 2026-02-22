import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { format, addDays, subDays, isSameDay, parseISO } from 'date-fns';
import Colors from '@/constants/Colors';

interface DateStripProps {
  selectedDate: string; // YYYY-MM-DD
  onDateSelect: (date: string) => void;
  bookingCounts?: Record<string, number>; // date -> count
}

const DAYS_BEFORE = 14;
const DAYS_AFTER = 30;
const ITEM_WIDTH = 58;

export default function DateStrip({ selectedDate, onDateSelect, bookingCounts }: DateStripProps) {
  const scrollRef = useRef<ScrollView>(null);
  const today = new Date();

  const dates: Date[] = [];
  for (let i = -DAYS_BEFORE; i <= DAYS_AFTER; i++) {
    dates.push(addDays(today, i));
  }

  // Scroll to selected date on mount
  useEffect(() => {
    const selectedIdx = dates.findIndex((d) =>
      isSameDay(d, parseISO(selectedDate))
    );
    if (selectedIdx >= 0 && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          x: Math.max(0, selectedIdx * ITEM_WIDTH - ITEM_WIDTH * 2.5),
          animated: false,
        });
      }, 100);
    }
  }, []);

  return (
    <View style={styles.container}>
      {/* Month/Year header */}
      <Text style={styles.monthLabel}>
        {format(parseISO(selectedDate), 'MMMM yyyy')}
      </Text>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {dates.map((date) => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const isSelected = dateStr === selectedDate;
          const isToday = isSameDay(date, today);
          const count = bookingCounts?.[dateStr] || 0;

          return (
            <Pressable
              key={dateStr}
              style={[
                styles.dateItem,
                isSelected && styles.dateItemSelected,
                isToday && !isSelected && styles.dateItemToday,
              ]}
              onPress={() => onDateSelect(dateStr)}
            >
              <Text
                style={[
                  styles.dayName,
                  isSelected && styles.textSelected,
                ]}
              >
                {format(date, 'EEE')}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  isSelected && styles.textSelected,
                  isToday && !isSelected && styles.dayNumberToday,
                ]}
              >
                {format(date, 'd')}
              </Text>
              {count > 0 && (
                <View style={[styles.dot, isSelected && styles.dotSelected]} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.light.surface,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  dateItem: {
    width: ITEM_WIDTH - 8,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  dateItemSelected: {
    backgroundColor: Colors.light.tint,
  },
  dateItemToday: {
    backgroundColor: Colors.light.tint + '12',
  },
  dayName: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.light.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  dayNumber: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
  },
  dayNumberToday: {
    color: Colors.light.tint,
  },
  textSelected: {
    color: '#ffffff',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.light.tint,
    marginTop: 4,
  },
  dotSelected: {
    backgroundColor: '#ffffff',
  },
});
