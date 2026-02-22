import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/services/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/Colors';

type Tab = 'overview' | 'revenue' | 'clients' | 'staff' | 'ai';
type DatePreset = 'today' | 'week' | 'month' | 'quarter' | 'year';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W = SCREEN_W - 48;

const CHART_CONFIG = {
  backgroundColor: '#fff',
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
  labelColor: () => Colors.light.textSecondary,
  propsForDots: { r: '4', strokeWidth: '2', stroke: Colors.light.tint },
  propsForBackgroundLines: { stroke: Colors.light.borderLight },
};

const PIE_COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function AnalyticsScreen() {
  const { businessId, role, firebaseUser } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [preset, setPreset] = useState<DatePreset>('month');
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    Promise.all([
      getDocs(query(collection(db, 'bookings'), where('businessId', '==', businessId))),
      getDocs(query(collection(db, 'staffPayments'), where('businessId', '==', businessId))),
    ]).then(([bSnap, pSnap]) => {
      setBookings(bSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPayments(pSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }).catch(() => {})
    .finally(() => setLoading(false));
  }, [businessId]);

  const { start, end } = useMemo(() => {
    const now = new Date();
    let s = new Date(now);
    if (preset === 'today') { s.setHours(0, 0, 0, 0); }
    else if (preset === 'week') { s.setDate(now.getDate() - 7); }
    else if (preset === 'month') { s.setMonth(now.getMonth() - 1); }
    else if (preset === 'quarter') { s.setMonth(now.getMonth() - 3); }
    else { s.setFullYear(now.getFullYear() - 1); }
    return { start: s, end: now };
  }, [preset]);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      const d = b.date?.toDate?.() || new Date(b.date);
      return d >= start && d <= end;
    });
  }, [bookings, start, end]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const d = p.createdAt?.toDate?.() || new Date(p.createdAt || 0);
      return d >= start && d <= end;
    });
  }, [payments, start, end]);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'clients', label: 'Clients' },
    { key: 'staff', label: 'Staff' },
    { key: 'ai', label: 'AI' },
  ];
  const PRESETS: { key: DatePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'quarter', label: 'Quarter' },
    { key: 'year', label: 'Year' },
  ];

  return (
    <>
      <Stack.Screen options={{ title: 'Analytics', headerStyle: { backgroundColor: Colors.light.headerBg }, headerTintColor: Colors.light.headerText, headerTitleAlign: 'center' }} />
      <View style={st.container}>
        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.tabScroll} contentContainerStyle={st.tabRow}>
          {TABS.map((t) => (
            <Pressable key={t.key} style={[st.tab, tab === t.key && st.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={[st.tabText, tab === t.key && st.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Date Presets */}
        {tab !== 'ai' && (
          <View style={st.presetRow}>
            {PRESETS.map((p) => (
              <Pressable key={p.key} style={[st.preset, preset === p.key && st.presetActive]} onPress={() => setPreset(p.key)}>
                <Text style={[st.presetText, preset === p.key && st.presetTextActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {loading ? (
          <View style={st.centered}><ActivityIndicator size="large" color={Colors.light.tint} /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {tab === 'overview' && <OverviewTab bookings={filtered} />}
            {tab === 'revenue' && <RevenueTab bookings={filtered} payments={filteredPayments} />}
            {tab === 'clients' && <ClientsTab bookings={filtered} />}
            {tab === 'staff' && <StaffTab bookings={filtered} payments={filteredPayments} />}
            {tab === 'ai' && <AITab businessId={businessId || ''} isOwner={role === 'owner'} />}
          </ScrollView>
        )}
      </View>
    </>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPI({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={st.kpiCard}>
      <Text style={st.kpiValue}>{value}</Text>
      <Text style={st.kpiLabel}>{label}</Text>
    </View>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ bookings }: { bookings: any[] }) {
  const completed = bookings.filter((b) => b.status === 'completed');
  const totalRevenue = completed.reduce((s, b) => s + (b.pricing?.total || b.totalPrice || 0), 0);
  const avgValue = completed.length > 0 ? totalRevenue / completed.length : 0;
  const completionRate = bookings.length > 0 ? (completed.length / bookings.length * 100) : 0;
  const clientEmails = new Set(bookings.map((b) => b.customer?.email || b.clientEmail).filter(Boolean));
  const repeatClients = Array.from(clientEmails).filter((email) => bookings.filter((b) => (b.customer?.email || b.clientEmail) === email).length >= 2);
  const repeatRate = clientEmails.size > 0 ? (repeatClients.length / clientEmails.size * 100) : 0;

  // Status breakdown for pie chart
  const statusCounts: Record<string, number> = {};
  bookings.forEach((b) => { statusCounts[b.status || 'unknown'] = (statusCounts[b.status || 'unknown'] || 0) + 1; });
  const pieData = Object.entries(statusCounts).map(([name, count], i) => ({
    name, population: count, color: PIE_COLORS[i % PIE_COLORS.length], legendFontColor: Colors.light.textSecondary, legendFontSize: 12,
  }));

  return (
    <>
      <View style={st.kpiRow}>
        <KPI label="Revenue" value={`$${totalRevenue.toFixed(0)}`} />
        <KPI label="Bookings" value={bookings.length} />
        <KPI label="Avg Value" value={`$${avgValue.toFixed(0)}`} />
      </View>
      <View style={st.kpiRow}>
        <KPI label="Completion" value={`${completionRate.toFixed(0)}%`} />
        <KPI label="Clients" value={clientEmails.size} />
        <KPI label="Repeat Rate" value={`${repeatRate.toFixed(0)}%`} />
      </View>
      {pieData.length > 0 && (
        <View style={st.chartCard}>
          <Text style={st.chartTitle}>Bookings by Status</Text>
          <PieChart data={pieData} width={CHART_W} height={180} chartConfig={CHART_CONFIG} accessor="population" backgroundColor="transparent" paddingLeft="15" />
        </View>
      )}
    </>
  );
}

// ─── Revenue Tab ─────────────────────────────────────────────────────────────

function RevenueTab({ bookings, payments }: { bookings: any[]; payments: any[] }) {
  const completed = bookings.filter((b) => b.status === 'completed');
  const gross = completed.reduce((s, b) => s + (b.pricing?.total || b.totalPrice || 0), 0);
  const staffCosts = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const profit = gross - staffCosts;

  // Revenue by service
  const byService: Record<string, number> = {};
  completed.forEach((b) => {
    const sn = b.serviceName || 'Other';
    byService[sn] = (byService[sn] || 0) + (b.pricing?.total || b.totalPrice || 0);
  });
  const topServices = Object.entries(byService).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <>
      <View style={st.kpiRow}>
        <KPI label="Gross Revenue" value={`$${gross.toFixed(0)}`} />
        <KPI label="Staff Costs" value={`$${staffCosts.toFixed(0)}`} />
        <KPI label="Profit" value={`$${profit.toFixed(0)}`} />
      </View>
      {topServices.length > 0 && (
        <View style={st.chartCard}>
          <Text style={st.chartTitle}>Revenue by Service</Text>
          {topServices.map(([name, amount], i) => (
            <View key={name} style={st.barRow}>
              <Text style={st.barLabel} numberOfLines={1}>{name}</Text>
              <View style={[st.bar, { flex: amount / (topServices[0][1] || 1), backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }]} />
              <Text style={st.barValue}>${amount.toFixed(0)}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

// ─── Clients Tab ─────────────────────────────────────────────────────────────

function ClientsTab({ bookings }: { bookings: any[] }) {
  const clientMap: Record<string, { count: number; total: number; name: string }> = {};
  bookings.forEach((b) => {
    const email = b.customer?.email || b.clientEmail || '';
    if (!email) return;
    if (!clientMap[email]) clientMap[email] = { count: 0, total: 0, name: b.customer?.firstName ? `${b.customer.firstName} ${b.customer.lastName || ''}`.trim() : b.clientName || email };
    clientMap[email].count++;
    clientMap[email].total += b.pricing?.total || b.totalPrice || 0;
  });
  const clients = Object.entries(clientMap);
  const totalClients = clients.length;
  const repeatClients = clients.filter(([, d]) => d.count >= 2).length;
  const repeatRate = totalClients > 0 ? (repeatClients / totalClients * 100) : 0;
  const totalRev = clients.reduce((s, [, d]) => s + d.total, 0);
  const avgValue = totalClients > 0 ? totalRev / totalClients : 0;

  const topClients = clients.sort((a, b) => b[1].total - a[1].total).slice(0, 10);

  return (
    <>
      <View style={st.kpiRow}>
        <KPI label="Total Clients" value={totalClients} />
        <KPI label="Repeat Rate" value={`${repeatRate.toFixed(0)}%`} />
        <KPI label="Avg Value" value={`$${avgValue.toFixed(0)}`} />
      </View>
      {topClients.length > 0 && (
        <View style={st.chartCard}>
          <Text style={st.chartTitle}>Top Clients by Revenue</Text>
          {topClients.map(([email, data], i) => (
            <View key={email} style={st.clientRow}>
              <Text style={st.clientRank}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.clientName}>{data.name}</Text>
                <Text style={st.clientEmail}>{email}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={st.clientTotal}>${data.total.toFixed(0)}</Text>
                <Text style={st.clientCount}>{data.count} booking{data.count !== 1 ? 's' : ''}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

// ─── Staff Tab ───────────────────────────────────────────────────────────────

function StaffTab({ bookings, payments }: { bookings: any[]; payments: any[] }) {
  const staffMap: Record<string, { name: string; jobs: number; revenue: number }> = {};
  payments.forEach((p) => {
    const id = p.staffId || p.staffName || 'Unknown';
    if (!staffMap[id]) staffMap[id] = { name: p.staffName || 'Unknown', jobs: 0, revenue: 0 };
    staffMap[id].jobs++;
    staffMap[id].revenue += p.amount || 0;
  });
  const staffList = Object.values(staffMap).sort((a, b) => b.jobs - a.jobs);
  const activeStaff = staffList.length;
  const avgJobs = activeStaff > 0 ? staffList.reduce((s, st) => s + st.jobs, 0) / activeStaff : 0;
  const topPerformer = staffList[0]?.name || 'N/A';

  const MEDALS = ['🥇', '🥈', '🥉'];

  return (
    <>
      <View style={st.kpiRow}>
        <KPI label="Active Staff" value={activeStaff} />
        <KPI label="Avg Jobs/Staff" value={avgJobs.toFixed(1)} />
        <KPI label="Top Performer" value={topPerformer} />
      </View>
      {staffList.length > 0 && (
        <View style={st.chartCard}>
          <Text style={st.chartTitle}>Staff Leaderboard</Text>
          {staffList.slice(0, 10).map((s, i) => (
            <View key={i} style={st.staffRow}>
              <Text style={st.staffMedal}>{i < 3 ? MEDALS[i] : `${i + 1}.`}</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.staffName}>{s.name}</Text>
                <Text style={st.staffMeta}>{s.jobs} jobs | ${s.revenue.toFixed(0)} earned</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

// ─── AI Tab ──────────────────────────────────────────────────────────────────

function AITab({ businessId, isOwner }: { businessId: string; isOwner: boolean }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  if (!isOwner) {
    return (
      <View style={st.centered}>
        <FontAwesome name="lock" size={40} color={Colors.light.textMuted} />
        <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.light.text, marginTop: 12 }}>Premium + Owner Only</Text>
        <Text style={{ fontSize: 13, color: Colors.light.textMuted, marginTop: 4, textAlign: 'center' }}>Only the business owner on the Premium plan can use the AI Analyst.</Text>
      </View>
    );
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    const newMsgs = [...messages, { role: 'user' as const, content: trimmed }];
    setMessages(newMsgs);
    setInput('');
    setSending(true);
    try {
      const fn = httpsCallable<any, { reply: string; usage?: any }>(functions, 'askAssistant');
      const res = await fn({
        businessId,
        message: trimmed,
        conversationHistory: newMsgs.slice(-10),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'AI request failed.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      {messages.length === 0 && (
        <View style={{ alignItems: 'center', marginVertical: 40 }}>
          <FontAwesome name="magic" size={36} color={Colors.light.tint} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.light.text, marginTop: 12 }}>AI Business Analyst</Text>
          <Text style={{ fontSize: 13, color: Colors.light.textMuted, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 }}>Ask questions about your business performance, trends, and get recommendations.</Text>
        </View>
      )}
      {messages.map((m, i) => (
        <View key={i} style={[st.aiMsg, m.role === 'user' && st.aiMsgUser]}>
          <Text style={[st.aiMsgText, m.role === 'user' && st.aiMsgTextUser]}>{m.content}</Text>
        </View>
      ))}
      {sending && <ActivityIndicator size="small" color={Colors.light.tint} style={{ marginTop: 8 }} />}
      <View style={st.aiInputRow}>
        <TextInput style={st.aiInput} value={input} onChangeText={setInput} placeholder="Ask a question..." placeholderTextColor={Colors.light.textMuted} maxLength={500} />
        <Pressable style={st.aiSendBtn} onPress={handleSend} disabled={!input.trim() || sending}>
          <FontAwesome name="send" size={14} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  tabScroll: { backgroundColor: Colors.light.surface, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  tabRow: { paddingHorizontal: 8, gap: 4 },
  tab: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.light.tint },
  tabText: { fontSize: 13, fontWeight: '500', color: Colors.light.textMuted },
  tabTextActive: { color: Colors.light.tint, fontWeight: '700' },
  presetRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  preset: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  presetActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  presetText: { fontSize: 12, fontWeight: '500', color: Colors.light.textSecondary },
  presetTextActive: { color: '#fff' },

  kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  kpiCard: { flex: 1, backgroundColor: Colors.light.surface, borderRadius: 10, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  kpiValue: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  kpiLabel: { fontSize: 11, color: Colors.light.textMuted, marginTop: 2 },

  chartCard: { backgroundColor: Colors.light.surface, borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  chartTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text, marginBottom: 12 },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  barLabel: { width: 80, fontSize: 12, color: Colors.light.textSecondary },
  bar: { height: 20, borderRadius: 4, minWidth: 4 },
  barValue: { fontSize: 12, fontWeight: '600', color: Colors.light.text, width: 50, textAlign: 'right' },

  clientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.borderLight, gap: 10 },
  clientRank: { fontSize: 14, fontWeight: '700', color: Colors.light.tint, width: 24 },
  clientName: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  clientEmail: { fontSize: 11, color: Colors.light.textMuted },
  clientTotal: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  clientCount: { fontSize: 11, color: Colors.light.textMuted },

  staffRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.borderLight, gap: 10 },
  staffMedal: { fontSize: 18, width: 30 },
  staffName: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  staffMeta: { fontSize: 12, color: Colors.light.textMuted, marginTop: 2 },

  aiMsg: { marginBottom: 10, padding: 12, borderRadius: 12, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border, maxWidth: '85%', alignSelf: 'flex-start' },
  aiMsgUser: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint, alignSelf: 'flex-end' },
  aiMsgText: { fontSize: 14, color: Colors.light.text, lineHeight: 20 },
  aiMsgTextUser: { color: '#fff' },
  aiInputRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  aiInput: { flex: 1, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: Colors.light.text, backgroundColor: Colors.light.surface },
  aiSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.light.tint, justifyContent: 'center', alignItems: 'center' },
});
