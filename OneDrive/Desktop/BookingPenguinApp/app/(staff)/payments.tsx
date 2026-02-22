import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeToPayments,
  confirmPaymentReceived,
  reportPaymentNotReceived,
  getPaymentStatusInfo,
} from '@/services/payments';
import { createNotification } from '@/services/bookings';
import Colors from '@/constants/Colors';
import type { StaffPaymentDoc } from '@/types';

type Tab = 'all' | 'pending' | 'awaiting_confirmation' | 'paid';

export default function StaffPaymentsScreen() {
  const { businessId, userDoc } = useAuth();
  const [payments, setPayments] = useState<StaffPaymentDoc[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const staffId = userDoc?.id;

  useEffect(() => {
    if (!businessId) return;

    const unsub = subscribeToPayments(
      businessId,
      (data) => {
        setPayments(data);
        setLoading(false);
        setRefreshing(false);
      },
      (err) => {
        console.error('Payments error:', err);
        setLoading(false);
      }
    );

    return unsub;
  }, [businessId]);

  const myPayments = useMemo(
    () => payments.filter((p) => p.staffId === staffId),
    [payments, staffId]
  );

  const filteredPayments = useMemo(() => {
    if (activeTab === 'all') return myPayments;
    return myPayments.filter((p) => p.status === activeTab);
  }, [myPayments, activeTab]);

  const kpis = useMemo(() => {
    let pendingCount = 0,
      pendingTotal = 0;
    let awaitingCount = 0,
      awaitingTotal = 0;
    let paidCount = 0,
      paidTotal = 0;

    myPayments.forEach((p) => {
      switch (p.status) {
        case 'pending':
          pendingCount++;
          pendingTotal += p.amount || 0;
          break;
        case 'awaiting_confirmation':
          awaitingCount++;
          awaitingTotal += p.amount || 0;
          break;
        case 'paid':
          paidCount++;
          paidTotal += p.amount || 0;
          break;
      }
    });

    return {
      pending: { count: pendingCount, total: pendingTotal },
      awaiting: { count: awaitingCount, total: awaitingTotal },
      paid: { count: paidCount, total: paidTotal },
    };
  }, [myPayments]);

  async function handleConfirm(payment: StaffPaymentDoc) {
    Alert.alert(
      'Confirm Payment',
      `Confirm you received $${payment.amount.toFixed(2)} for ${payment.serviceName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Received',
          onPress: async () => {
            try {
              await confirmPaymentReceived(payment.id);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to confirm payment.');
            }
          },
        },
      ]
    );
  }

  async function handleDispute(payment: StaffPaymentDoc) {
    Alert.alert(
      'Report Issue',
      `Report that you have NOT received the $${payment.amount.toFixed(2)} payment?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report Not Received',
          style: 'destructive',
          onPress: async () => {
            try {
              await reportPaymentNotReceived(payment.id);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to report issue.');
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading payments...</Text>
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
        <Text style={styles.pageTitle}>My Payments</Text>

        {/* 3 KPI Cards */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { borderLeftColor: Colors.light.warning }]}>
            <FontAwesome name="clock-o" size={16} color={Colors.light.warning} />
            <Text style={styles.kpiLabel}>Pending Payment</Text>
            <Text style={[styles.kpiAmount, { color: Colors.light.warning }]}>
              ${kpis.pending.total.toFixed(2)}
            </Text>
            <Text style={styles.kpiCount}>{kpis.pending.count} payment{kpis.pending.count !== 1 ? 's' : ''}</Text>
          </View>

          <View style={[styles.kpiCard, { borderLeftColor: Colors.light.tint }]}>
            <FontAwesome name="hourglass-half" size={16} color={Colors.light.tint} />
            <Text style={styles.kpiLabel}>Awaiting Confirm</Text>
            <Text style={[styles.kpiAmount, { color: Colors.light.tint }]}>
              ${kpis.awaiting.total.toFixed(2)}
            </Text>
            <Text style={styles.kpiCount}>{kpis.awaiting.count} payment{kpis.awaiting.count !== 1 ? 's' : ''}</Text>
          </View>

          <View style={[styles.kpiCard, { borderLeftColor: Colors.light.success }]}>
            <FontAwesome name="check-circle" size={16} color={Colors.light.success} />
            <Text style={styles.kpiLabel}>Total Earned</Text>
            <Text style={[styles.kpiAmount, { color: Colors.light.success }]}>
              ${kpis.paid.total.toFixed(2)}
            </Text>
            <Text style={styles.kpiCount}>{kpis.paid.count} payment{kpis.paid.count !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        {/* Tab Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          <View style={styles.tabBar}>
            {([
              { key: 'all' as Tab, label: 'All' },
              { key: 'pending' as Tab, label: 'Pending' },
              { key: 'awaiting_confirmation' as Tab, label: 'Awaiting' },
              { key: 'paid' as Tab, label: 'Paid' },
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
        </ScrollView>

        {/* Payment List */}
        {filteredPayments.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome name="money" size={36} color={Colors.light.textMuted} />
            <Text style={styles.emptyTitle}>No payments yet</Text>
            <Text style={styles.emptySubtext}>
              Payments will appear here after completing jobs.
            </Text>
          </View>
        ) : (
          filteredPayments.map((payment) => (
            <StaffPaymentCard
              key={payment.id}
              payment={payment}
              onConfirm={() => handleConfirm(payment)}
              onDispute={() => handleDispute(payment)}
            />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function StaffPaymentCard({
  payment,
  onConfirm,
  onDispute,
}: {
  payment: StaffPaymentDoc;
  onConfirm: () => void;
  onDispute: () => void;
}) {
  const statusInfo = getPaymentStatusInfo(payment.status);

  return (
    <View style={styles.paymentCard}>
      <View style={styles.paymentHeader}>
        <Text style={styles.paymentAmount}>${payment.amount.toFixed(2)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bgColor }]}>
          <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
        </View>
      </View>

      <View style={styles.paymentDetails}>
        <DetailRow icon="briefcase" value={payment.serviceName} />
        <DetailRow icon="calendar" value={payment.serviceDate} />
        <DetailRow
          icon="clock-o"
          value={`${payment.estimatedTimeMinutes} min @ $${payment.hourlyRate}/hr`}
        />
        {payment.totalStaffOnJob > 1 && (
          <DetailRow
            icon="users"
            value={`Split: ${payment.splitPercent}% of job (${payment.splitMinutes} min)`}
          />
        )}
      </View>

      {/* Pending: no buttons, just info text */}
      {payment.status === 'pending' && (
        <View style={styles.statusInfo}>
          <FontAwesome name="info-circle" size={13} color={Colors.light.textMuted} />
          <Text style={styles.statusInfoText}>Waiting for admin to mark as paid</Text>
        </View>
      )}

      {/* Awaiting confirmation: Confirm + Not Received */}
      {payment.status === 'awaiting_confirmation' && (
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.8 }]}
            onPress={onConfirm}
          >
            <FontAwesome name="check" size={14} color="#fff" />
            <Text style={styles.confirmText}>Confirm Received</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.disputeBtn, pressed && { opacity: 0.8 }]}
            onPress={onDispute}
          >
            <FontAwesome name="exclamation-circle" size={14} color={Colors.light.danger} />
            <Text style={styles.disputeText}>Not Received</Text>
          </Pressable>
        </View>
      )}

      {/* Paid: confirmed info */}
      {payment.status === 'paid' && payment.confirmedAt && (
        <View style={styles.confirmedRow}>
          <FontAwesome name="check-circle" size={14} color={Colors.light.success} />
          <Text style={styles.confirmedText}>
            Confirmed{' '}
            {payment.confirmedAt && 'seconds' in payment.confirmedAt
              ? format(new Date(payment.confirmedAt.seconds * 1000), 'MMM d, yyyy')
              : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

function DetailRow({
  icon,
  value,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <FontAwesome name={icon} size={13} color={Colors.light.textMuted} style={{ width: 18 }} />
      <Text style={styles.detailValue}>{value}</Text>
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
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.light.text,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },

  // KPI Cards
  kpiRow: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: 0,
  },
  kpiLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: '500',
    marginTop: 6,
  },
  kpiAmount: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  kpiCount: { fontSize: 12, color: Colors.light.textMuted, marginTop: 2 },

  // Tabs
  tabScroll: { marginBottom: 14 },
  tabBar: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  tabActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
  tabTextActive: { color: '#fff' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 48, marginHorizontal: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.light.text, marginTop: 14 },
  emptySubtext: { fontSize: 13, color: Colors.light.textMuted, marginTop: 4 },

  // Payment card
  paymentCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  paymentAmount: { fontSize: 20, fontWeight: '700', color: Colors.light.text },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },

  paymentDetails: {
    gap: 5,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailValue: {
    fontSize: 13,
    color: Colors.light.text,
    fontWeight: '500',
    marginLeft: 8,
    flex: 1,
  },

  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  statusInfoText: { fontSize: 13, color: Colors.light.textMuted },

  // Actions
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.light.success,
    borderRadius: 8,
  },
  confirmText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  disputeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.light.dangerLight,
    borderRadius: 8,
  },
  disputeText: { color: Colors.light.danger, fontSize: 13, fontWeight: '600' },

  confirmedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  confirmedText: { fontSize: 13, color: Colors.light.success, fontWeight: '500' },
});
