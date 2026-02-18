import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';
import type { BookingDoc } from '@/types';
import { getStatusInfo } from '@/services/bookings';

interface BookingCardProps {
  booking: BookingDoc;
  onPress?: (booking: BookingDoc) => void;
  compact?: boolean;
}

export default function BookingCard({ booking, onPress, compact }: BookingCardProps) {
  const customerName =
    `${booking.customer?.firstName || ''} ${booking.customer?.lastName || ''}`.trim() ||
    'No customer';
  const { label: statusLabel, colorKey } = getStatusInfo(booking.status);
  const statusColor = Colors.light[colorKey];

  if (compact) {
    return (
      <Pressable
        style={({ pressed }) => [styles.compactCard, pressed && styles.cardPressed]}
        onPress={() => onPress?.(booking)}
      >
        <View style={[styles.compactStripe, { backgroundColor: statusColor }]} />
        <View style={styles.compactContent}>
          <Text style={styles.compactService} numberOfLines={1}>
            {booking.serviceName || 'Untitled Service'}
          </Text>
          <Text style={styles.compactCustomer} numberOfLines={1}>
            {customerName}
          </Text>
          <View style={styles.compactMeta}>
            {booking.time && (
              <Text style={styles.compactTime}>{booking.time}</Text>
            )}
            {booking.date && (
              <Text style={styles.compactDate}>{booking.date}</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18', alignSelf: 'flex-start', marginTop: 6 }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          {booking.pricing?.total != null && (
            <Text style={styles.compactPrice}>${booking.pricing.total.toFixed(2)}</Text>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress?.(booking)}
    >
      {/* Status stripe on the left */}
      <View style={[styles.statusStripe, { backgroundColor: statusColor }]} />

      <View style={styles.content}>
        {/* Top row: service name + time */}
        <View style={styles.topRow}>
          <Text style={styles.serviceName} numberOfLines={1}>
            {booking.serviceName || 'Untitled Service'}
          </Text>
          {booking.time && (
            <Text style={styles.time}>{booking.time}</Text>
          )}
        </View>

        {/* Customer */}
        <View style={styles.infoRow}>
          <FontAwesome name="user" size={12} color={Colors.light.textSecondary} />
          <Text style={styles.infoText} numberOfLines={1}>
            {customerName}
          </Text>
        </View>

        {/* Bottom row: status + assigned staff */}
        <View style={styles.bottomRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>

          {booking.assignedToName ? (
            <View style={styles.assignedRow}>
              <FontAwesome name="id-badge" size={11} color={Colors.light.textMuted} />
              <Text style={styles.assignedText} numberOfLines={1}>
                {booking.assignedToName}
              </Text>
            </View>
          ) : (
            <Text style={styles.unassignedText}>Unassigned</Text>
          )}

          {booking.pricing?.total != null && (
            <Text style={styles.price}>
              ${booking.pricing.total.toFixed(2)}
            </Text>
          )}
        </View>
      </View>

      {/* Chevron */}
      <FontAwesome
        name="chevron-right"
        size={12}
        color={Colors.light.textMuted}
        style={styles.chevron}
      />
    </Pressable>
  );
}

const COMPACT_CARD_WIDTH = 200;

const styles = StyleSheet.create({
  // Compact card for horizontal scroll
  compactCard: {
    width: COMPACT_CARD_WIDTH,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden',
  },
  compactStripe: {
    height: 4,
  },
  compactContent: {
    padding: 12,
  },
  compactService: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 3,
  },
  compactCustomer: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  compactMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  compactTime: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  compactDate: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  compactPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
    marginTop: 6,
  },

  // Full card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.85,
  },
  statusStripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    padding: 14,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    flex: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  assignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  assignedText: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  unassignedText: {
    fontSize: 12,
    color: Colors.light.textMuted,
    fontStyle: 'italic',
    flex: 1,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.text,
  },
  chevron: {
    marginRight: 14,
  },
});
