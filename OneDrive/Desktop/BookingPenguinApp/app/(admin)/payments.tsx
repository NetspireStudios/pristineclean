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
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeToPayments,
  subscribeToRevenue,
  markPaymentPaid,
  getPaymentStatusInfo,
} from '@/services/payments';
import Colors from '@/constants/Colors';
import type { StaffPaymentDoc, CompanyRevenueDoc } from '@/types';

type Tab = 'pending' | 'awaiting_confirmation' | 'paid';

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'awaiting_confirmation', label: 'Awaiting' },
  { key: 'paid', label: 'Paid' },
];

export default function PaymentsScreen() {
  const { businessId, role } = useAuth();
  const [payments, setPayments] = useState<StaffPaymentDoc[]>([]);
  const [revenue, setRevenue] = useState<CompanyRevenueDoc[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showRevenueDetails, setShowRevenueDetails] = useState(false);

  useEffect(() => {
    if (!businessId) return;

    const unsubPayments = subscribeToPayments(
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

    const unsubRevenue = subscribeToRevenue(businessId, setRevenue);

    return () => {
      unsubPayments();
      unsubRevenue();
    };
  }, [businessId]);

  const filteredPayments = useMemo(
    () => payments.filter((p) => p.status === activeTab),
    [payments, activeTab]
  );

  const tabCounts = useMemo(() => {
    const counts: Record<Tab, number> = { pending: 0, awaiting_confirmation: 0, paid: 0 };
    payments.forEach((p) => {
      if (p.status in counts) counts[p.status as Tab]++;
    });
    return counts;
  }, [payments]);

  const totalPendingAmount = useMemo(() => {
    return payments
      .filter((p) => p.status === 'pending')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [payments]);

  const totalPaidAmount = useMemo(() => {
    return payments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [payments]);

  const adminRevenue = useMemo(() => {
    const total = revenue.reduce((sum, r) => sum + (r.amount || r.jobAmount || 0), 0);
    return { total, count: revenue.length };
  }, [revenue]);

  async function handleMarkPaid(payment: StaffPaymentDoc) {
    Alert.alert(
      'Mark as Paid',
      `Mark $${payment.amount.toFixed(2)} payment to ${payment.staffName} as paid?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Paid',
          onPress: async () => {
            try {
              await markPaymentPaid(payment.id);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to mark payment as paid.');
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
        <Text style={styles.pageTitle}>Payments</Text>

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <FontAwesome name="clock-o" size={18} color={Colors.light.warning} />
            <Text style={styles.summaryLabel}>Pending Payout</Text>
            <Text style={[styles.summaryValue, { color: Colors.light.warning }]}>
              ${totalPendingAmount.toFixed(2)}
            </Text>
            <Text style={styles.summarySubtext}>{tabCounts.pending} payments</Text>
          </View>
          <View style={styles.summaryCard}>
            <FontAwesome name="check-circle" size={18} color={Colors.light.success} />
            <Text style={styles.summaryLabel}>Total Paid</Text>
            <Text style={[styles.summaryValue, { color: Colors.light.success }]}>
              ${totalPaidAmount.toFixed(2)}
            </Text>
            <Text style={styles.summarySubtext}>{tabCounts.paid} payments</Text>
          </View>
        </View>

        {/* Admin Revenue Card */}
        <Pressable
          style={styles.revenueCard}
          onPress={() => setShowRevenueDetails(!showRevenueDetails)}
        >
          <View style={styles.revenueHeader}>
            <View style={styles.revenueLeft}>
              <View style={styles.revenueIcon}>
                <FontAwesome name="building" size={16} color="#7c3aed" />
              </View>
              <View>
                <Text style={styles.revenueTitle}>Admin Revenue</Text>
                <Text style={styles.revenueSubtext}>
                  {adminRevenue.count} admin-completed job{adminRevenue.count !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            <View style={styles.revenueRight}>
              <Text style={styles.revenueAmount}>${adminRevenue.total.toFixed(2)}</Text>
              <FontAwesome
                name={showRevenueDetails ? 'chevron-up' : 'chevron-down'}
                size={12}
                color="#7c3aed"
              />
            </View>
          </View>

          {showRevenueDetails && revenue.length > 0 && (
            <View style={styles.revenueDetails}>
              {revenue.map((r) => (
                <Pressable
                  key={r.id}
                  style={styles.revenueItem}
                  onPress={() =>
                    router.push({
                      pathname: '/booking-detail',
                      params: { bookingId: r.bookingId || r.jobId },
                    })
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.revenueItemService}>{r.serviceName}</Text>
                    <Text style={styles.revenueItemMeta}>
                      {r.completedByName ? `${r.completedByName} · ` : ''}
                      {r.serviceDate}
                    </Text>
                  </View>
                  <View style={styles.revenueItemRight}>
                    <Text style={styles.revenueItemAmount}>
                      ${(r.amount || r.jobAmount || 0).toFixed(2)}
                    </Text>
                    <FontAwesome
                      name="external-link"
                      size={11}
                      color={Colors.light.textMuted}
                    />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </Pressable>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {tabCounts[tab.key] > 0 && (
                <View
                  style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}
                >
                  <Text
                    style={[
                      styles.tabBadgeText,
                      activeTab === tab.key && styles.tabBadgeTextActive,
                    ]}
                  >
                    {tabCounts[tab.key]}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {/* Payment List */}
        {filteredPayments.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome name="credit-card" size={36} color={Colors.light.textMuted} />
            <Text style={styles.emptyTitle}>No {activeTab.replace('_', ' ')} payments</Text>
          </View>
        ) : (
          filteredPayments.map((payment) => (
            <PaymentCard
              key={payment.id}
              payment={payment}
              isAdmin={role === 'owner' || role === 'admin'}
              onMarkPaid={() => handleMarkPaid(payment)}
            />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function PaymentCard({
  payment,
  isAdmin,
  onMarkPaid,
}: {
  payment: StaffPaymentDoc;
  isAdmin: boolean;
  onMarkPaid: () => void;
}) {
  const statusInfo = getPaymentStatusInfo(payment.status);

  return (
    <View style={styles.paymentCard}>
      <View style={styles.paymentHeader}>
        <View style={styles.paymentLeft}>
          <Text style={styles.paymentAmount}>${payment.amount.toFixed(2)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.bgColor }]}>
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.paymentDetails}>
        <DetailRow icon="user" label="Staff" value={payment.staffName} />
        <DetailRow icon="briefcase" label="Service" value={payment.serviceName} />
        <DetailRow icon="calendar" label="Date" value={payment.serviceDate} />
        <DetailRow icon="clock-o" label="Time" value={`${payment.estimatedTimeMinutes} min`} />
        <DetailRow icon="dollar" label="Rate" value={`$${payment.hourlyRate}/hr`} />
        {payment.totalStaffOnJob > 1 && (
          <DetailRow
            icon="users"
            label="Split"
            value={`${payment.splitPercent}% (${payment.splitMinutes} min)`}
          />
        )}
      </View>

      {isAdmin && payment.status === 'pending' && (
        <Pressable
          style={({ pressed }) => [styles.markPaidBtn, pressed && { opacity: 0.8 }]}
          onPress={onMarkPaid}
        >
          <FontAwesome name="check" size={14} color="#fff" />
          <Text style={styles.markPaidText}>Mark as Paid</Text>
        </Pressable>
      )}

      {isAdmin && payment.status === 'awaiting_confirmation' && (
        <View style={styles.awaitingRow}>
          <FontAwesome name="hourglass-half" size={13} color={Colors.light.tint} />
          <Text style={styles.awaitingText}>Waiting for staff to confirm...</Text>
        </View>
      )}

      {payment.status === 'paid' && payment.confirmedAt && (
        <View style={styles.confirmedRow}>
          <FontAwesome name="check-circle" size={14} color={Colors.light.success} />
          <Text style={styles.confirmedText}>Confirmed by staff</Text>
        </View>
      )}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <FontAwesome name={icon} size={13} color={Colors.light.textMuted} style={{ width: 18 }} />
      <Text style={styles.detailLabel}>{label}</Text>
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

  // Summary
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    gap: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontWeight: '500',
    marginTop: 4,
  },
  summaryValue: { fontSize: 22, fontWeight: '700' },
  summarySubtext: { fontSize: 12, color: Colors.light.textMuted },

  // Admin Revenue
  revenueCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#f5f3ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    overflow: 'hidden',
  },
  revenueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  revenueLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  revenueIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  revenueTitle: { fontSize: 14, fontWeight: '700', color: '#7c3aed' },
  revenueSubtext: { fontSize: 12, color: '#8b5cf6', marginTop: 1 },
  revenueRight: { alignItems: 'flex-end', gap: 4 },
  revenueAmount: { fontSize: 20, fontWeight: '700', color: '#7c3aed' },

  revenueDetails: {
    borderTopWidth: 1,
    borderTopColor: '#ddd6fe',
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  revenueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ede9fe',
  },
  revenueItemService: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  revenueItemMeta: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  revenueItemRight: { alignItems: 'flex-end', gap: 4, marginLeft: 10 },
  revenueItemAmount: { fontSize: 14, fontWeight: '700', color: '#7c3aed' },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 5,
  },
  tabActive: { backgroundColor: Colors.light.tint },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
  tabTextActive: { color: '#fff' },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.light.border,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.light.textSecondary },
  tabBadgeTextActive: { color: '#fff' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 48, marginHorizontal: 16 },
  emptyTitle: { fontSize: 15, color: Colors.light.textMuted, marginTop: 12 },

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
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  paymentAmount: { fontSize: 20, fontWeight: '700', color: Colors.light.text },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },

  paymentDetails: {
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailLabel: {
    fontSize: 13,
    color: Colors.light.textMuted,
    width: 60,
    marginLeft: 6,
  },
  detailValue: {
    fontSize: 13,
    color: Colors.light.text,
    fontWeight: '500',
    flex: 1,
  },

  markPaidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    backgroundColor: Colors.light.success,
    borderRadius: 8,
  },
  markPaidText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  awaitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  awaitingText: { fontSize: 13, color: Colors.light.tint, fontWeight: '500' },

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
