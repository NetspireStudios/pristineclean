import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  Switch,
} from 'react-native';
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  subscribeToServices,
  createService,
  updateService,
  deleteService,
} from '@/services/business';
import Colors from '@/constants/Colors';
import type { ServiceDoc, FormField, ServiceExtra } from '@/types';

const PLAN_SERVICE_LIMITS: Record<string, number> = {
  starter: 3,
  pro: 10,
  premium: 25,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).substring(2, 10);
}

function emptyField(): FormField {
  return {
    id: genId(),
    label: '',
    fieldType: 'text',
    required: false,
    order: 0,
    hasPricing: false,
    hasTimeImpact: false,
  };
}

function emptyExtra(): ServiceExtra {
  return { id: genId(), label: '', price: 0 };
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function ServicesScreen() {
  const { businessId, firebaseUser } = useAuth();
  const authUid = firebaseUser?.uid || '';
  const [services, setServices] = useState<ServiceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardVisible, setWizardVisible] = useState(false);
  const [editingService, setEditingService] = useState<ServiceDoc | null>(null);
  const [planName, setPlanName] = useState<string>('starter');

  useEffect(() => {
    if (!businessId) return;
    const unsub = subscribeToServices(
      businessId,
      (data) => {
        const sorted = [...data].sort((a, b) => {
          if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
          return (a.name || '').localeCompare(b.name || '');
        });
        setServices(sorted);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [businessId]);

  useEffect(() => {
    if (!authUid) return;
    const q = query(
      collection(db, 'customers', authUid, 'subscriptions'),
      where('status', 'in', ['active', 'trialing', 'past_due'])
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const sub = snap.docs[0].data();
        const raw = (
          sub.items?.[0]?.price?.product?.name ||
          sub.items?.[0]?.price?.nickname ||
          sub.role ||
          sub.metadata?.plan ||
          ''
        ).toLowerCase();
        if (raw.includes('premium')) setPlanName('premium');
        else if (raw.includes('pro')) setPlanName('pro');
        else setPlanName('starter');
      }
    }, () => {});
    return unsub;
  }, [authUid]);

  const maxServices = PLAN_SERVICE_LIMITS[planName] || 3;
  const activeCount = services.filter((s) => s.isActive).length;

  function openCreate() {
    setEditingService(null);
    setWizardVisible(true);
  }

  function openEdit(svc: ServiceDoc) {
    setEditingService(svc);
    setWizardVisible(true);
  }

  function handleDeleteService(svc: ServiceDoc) {
    Alert.alert('Delete Service', `Delete "${svc.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteService(svc.id).catch((e: any) => Alert.alert('Error', e.message)),
      },
    ]);
  }

  function toggleActive(svc: ServiceDoc) {
    updateService(svc.id, { isActive: !svc.isActive }).catch((e: any) =>
      Alert.alert('Error', e.message)
    );
  }

  function renderCard({ item }: { item: ServiceDoc }) {
    const qCount = item.formFields?.length || 0;
    return (
      <View style={s.serviceCard}>
        {/* Top row: name + badge + toggle */}
        <View style={s.cardTopRow}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.serviceName} numberOfLines={1}>{item.name}</Text>
            <View style={[s.activeBadge, !item.isActive && s.inactiveBadge]}>
              <Text style={[s.activeBadgeText, !item.isActive && s.inactiveBadgeText]}>{item.isActive ? 'ACTIVE' : 'INACTIVE'}</Text>
            </View>
          </View>
          <Switch
            value={item.isActive}
            onValueChange={() => toggleActive(item)}
            trackColor={{ false: Colors.light.border, true: Colors.light.tint + '60' }}
            thumbColor={item.isActive ? Colors.light.tint : Colors.light.textMuted}
          />
        </View>

        {/* Description */}
        {item.description ? <Text style={s.serviceDesc} numberOfLines={2}>{item.description}</Text> : null}

        {/* Meta row */}
        <View style={s.serviceMeta}>
          <View style={s.metaItem}><FontAwesome name="dollar" size={12} color={Colors.light.textSecondary} /><Text style={s.metaText}>${(item.basePrice || 0).toFixed(2)}</Text></View>
          <View style={s.metaItem}><FontAwesome name="clock-o" size={12} color={Colors.light.textSecondary} /><Text style={s.metaText}>{item.duration || 0} min</Text></View>
          <View style={s.metaItem}><FontAwesome name="list" size={11} color={Colors.light.textSecondary} /><Text style={s.metaText}>{qCount} question{qCount !== 1 ? 's' : ''}</Text></View>
        </View>

        {/* Action row: Edit + Delete */}
        <View style={s.actionRow}>
          <Pressable style={s.editBtn} onPress={() => openEdit(item)}>
            <FontAwesome name="pencil" size={13} color={Colors.light.tint} />
            <Text style={s.editBtnText}>Edit</Text>
          </Pressable>
          <Pressable onPress={() => handleDeleteService(item)} hitSlop={10} style={s.deleteBtn}>
            <FontAwesome name="trash-o" size={16} color={Colors.light.danger} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Services', headerStyle: { backgroundColor: Colors.light.headerBg }, headerTintColor: Colors.light.headerText, headerTitleAlign: 'center' }} />
      <View style={s.container}>
        {/* Header row */}
        {!loading && (
          <View style={s.headerRow}>
            <View>
              <Text style={s.pageTitle}>Service Forms</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <View style={s.countBadge}><Text style={s.countBadgeText}>{activeCount}/{maxServices} Active</Text></View>
              </View>
            </View>
            <Pressable style={s.createBtn} onPress={openCreate}>
              <FontAwesome name="plus" size={12} color="#fff" />
              <Text style={s.createBtnText}>Create Service</Text>
            </Pressable>
          </View>
        )}
        {loading ? (
          <View style={s.loadingContainer}><ActivityIndicator size="large" color={Colors.light.tint} /></View>
        ) : (
          <FlatList data={services} keyExtractor={(i) => i.id} renderItem={renderCard} contentContainerStyle={s.listContent}
            ListEmptyComponent={<View style={s.emptyContainer}><FontAwesome name="wrench" size={40} color={Colors.light.textMuted} /><Text style={s.emptyTitle}>No Services</Text><Text style={s.emptySubtitle}>Create your first service to start accepting bookings.</Text></View>}
          />
        )}
        {wizardVisible && (
          <ServiceWizard
            businessId={businessId || ''}
            editing={editingService}
            onClose={() => setWizardVisible(false)}
          />
        )}
      </View>
    </>
  );
}

// ── 4-Step Wizard ────────────────────────────────────────────────────────────

function ServiceWizard({
  businessId,
  editing,
  onClose,
}: {
  businessId: string;
  editing: ServiceDoc | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Basics
  const [name, setName] = useState(editing?.name || '');
  const [desc, setDesc] = useState(editing?.description || '');
  const [price, setPrice] = useState(editing?.basePrice != null ? String(editing.basePrice) : '');
  const [duration, setDuration] = useState(editing?.duration != null ? String(editing.duration) : '');
  const isActive = editing?.isActive ?? true;

  // Step 2: Questions
  const [fields, setFields] = useState<FormField[]>(
    editing?.formFields?.length ? [...editing.formFields] : []
  );

  // Step 3: Extras
  const [extras, setExtras] = useState<ServiceExtra[]>(
    editing?.extras?.length ? [...editing.extras] : []
  );

  const STEP_LABELS = ['Basics', 'Questions', 'Add-ons', 'Preview'];

  function nextStep() {
    if (step === 0) {
      if (!name.trim()) { Alert.alert('Required', 'Service name is required.'); return; }
      if (!price || isNaN(Number(price))) { Alert.alert('Required', 'Base price is required.'); return; }
      if (!duration || isNaN(Number(duration))) { Alert.alert('Required', 'Duration is required.'); return; }
    }
    setStep((s) => Math.min(s + 1, 3));
  }
  function prevStep() { setStep((s) => Math.max(s - 1, 0)); }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const orderedFields = fields.map((f, i) => ({ ...f, order: i }));
      if (editing) {
        await updateService(editing.id, {
          name: name.trim(),
          description: desc.trim(),
          basePrice: parseFloat(price),
          duration: parseInt(duration, 10),
          formFields: orderedFields,
          extras,
          isActive,
        });
      } else {
        await createService({
          businessId,
          name: name.trim(),
          description: desc.trim(),
          basePrice: parseFloat(price),
          estimatedTime: parseInt(duration, 10),
          isActive,
          fields: orderedFields as any,
          extras: extras as any,
        });
      }
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save service.');
    } finally {
      setSubmitting(false);
    }
  }

  // Field editing helpers
  function addField() { setFields((prev) => [...prev, emptyField()]); }
  function removeField(id: string) { setFields((prev) => prev.filter((f) => f.id !== id)); }
  function updateField(id: string, updates: Partial<FormField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }
  function moveField(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= fields.length) return;
    const copy = [...fields];
    [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
    setFields(copy);
  }

  function addExtra() { setExtras((prev) => [...prev, emptyExtra()]); }
  function removeExtra(id: string) { setExtras((prev) => prev.filter((e) => e.id !== id)); }
  function updateExtra(id: string, updates: Partial<ServiceExtra>) {
    setExtras((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  }

  // Calculate preview totals
  const baseP = parseFloat(price) || 0;
  const baseDur = parseInt(duration, 10) || 0;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={wiz.container}>
        {/* Header */}
        <View style={wiz.header}>
          <Pressable onPress={onClose}><Text style={wiz.cancelText}>Cancel</Text></Pressable>
          <Text style={wiz.headerTitle}>{editing ? 'Edit Service' : 'New Service'}</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Step Indicator */}
        <View style={wiz.stepBar}>
          {STEP_LABELS.map((label, i) => (
            <View key={i} style={wiz.stepItem}>
              <View style={[wiz.stepCircle, i <= step && wiz.stepCircleActive]}>
                <Text style={[wiz.stepNum, i <= step && wiz.stepNumActive]}>{i + 1}</Text>
              </View>
              <Text style={[wiz.stepLabel, i === step && wiz.stepLabelActive]}>{label}</Text>
            </View>
          ))}
        </View>

        <ScrollView style={wiz.body} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <>
              <Text style={wiz.label}>Service Name *</Text>
              <TextInput style={wiz.input} value={name} onChangeText={setName} placeholder="e.g. Deep Clean" placeholderTextColor={Colors.light.textMuted} />
              <Text style={wiz.label}>Description</Text>
              <TextInput style={[wiz.input, { minHeight: 80 }]} value={desc} onChangeText={setDesc} placeholder="Describe this service..." placeholderTextColor={Colors.light.textMuted} multiline textAlignVertical="top" />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}><Text style={wiz.label}>Base Price ($) *</Text><TextInput style={wiz.input} value={price} onChangeText={setPrice} placeholder="100" placeholderTextColor={Colors.light.textMuted} keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Text style={wiz.label}>Duration (min) *</Text><TextInput style={wiz.input} value={duration} onChangeText={setDuration} placeholder="120" placeholderTextColor={Colors.light.textMuted} keyboardType="number-pad" /></View>
              </View>
            </>
          )}

          {step === 1 && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={wiz.sectionHeading}>Form Questions ({fields.length})</Text>
                <Pressable style={wiz.addBtn} onPress={addField}><FontAwesome name="plus" size={12} color="#fff" /><Text style={wiz.addBtnText}>Add</Text></Pressable>
              </View>
              {fields.length === 0 && <Text style={{ color: Colors.light.textMuted, textAlign: 'center', marginVertical: 20 }}>No questions yet. Add questions to customize your booking form.</Text>}
              {fields.map((field, idx) => (
                <FieldEditor key={field.id} field={field} index={idx} total={fields.length} onUpdate={(u) => updateField(field.id, u)} onRemove={() => removeField(field.id)} onMove={(dir) => moveField(idx, dir)} />
              ))}
            </>
          )}

          {step === 2 && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={wiz.sectionHeading}>Add-ons ({extras.length})</Text>
                <Pressable style={wiz.addBtn} onPress={addExtra}><FontAwesome name="plus" size={12} color="#fff" /><Text style={wiz.addBtnText}>Add</Text></Pressable>
              </View>
              {extras.length === 0 && <Text style={{ color: Colors.light.textMuted, textAlign: 'center', marginVertical: 20 }}>No add-ons yet. Add optional extras clients can select.</Text>}
              {extras.map((ex) => (
                <View key={ex.id} style={wiz.extraRow}>
                  <TextInput style={[wiz.input, { flex: 1 }]} value={ex.label} onChangeText={(t) => updateExtra(ex.id, { label: t })} placeholder="Extra name" placeholderTextColor={Colors.light.textMuted} />
                  <TextInput style={[wiz.input, { width: 80 }]} value={ex.price ? String(ex.price) : ''} onChangeText={(t) => updateExtra(ex.id, { price: parseFloat(t) || 0 })} placeholder="$0" placeholderTextColor={Colors.light.textMuted} keyboardType="decimal-pad" />
                  <Pressable onPress={() => removeExtra(ex.id)} hitSlop={8}><FontAwesome name="times-circle" size={20} color={Colors.light.danger} /></Pressable>
                </View>
              ))}
            </>
          )}

          {step === 3 && (
            <>
              <Text style={wiz.sectionHeading}>Preview</Text>
              <View style={wiz.previewCard}>
                <Text style={wiz.previewName}>{name || 'Untitled'}</Text>
                {desc ? <Text style={wiz.previewDesc}>{desc}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                  <Text style={wiz.previewMeta}>Base: ${baseP.toFixed(2)}</Text>
                  <Text style={wiz.previewMeta}>{baseDur} min</Text>
                  <Text style={wiz.previewMeta}>{isActive ? 'Active' : 'Inactive'}</Text>
                </View>
              </View>
              {fields.length > 0 && (
                <><Text style={wiz.previewSection}>Questions ({fields.length})</Text>
                {fields.map((f, i) => (
                  <View key={f.id} style={wiz.previewItem}>
                    <Text style={wiz.previewItemLabel}>{i + 1}. {f.label || '(untitled)'}</Text>
                    <Text style={wiz.previewItemMeta}>Type: {f.fieldType}{f.required ? ' (required)' : ''}{f.hasPricing ? ' | Affects price' : ''}{f.hasTimeImpact ? ' | Affects time' : ''}</Text>
                  </View>
                ))}</>
              )}
              {extras.length > 0 && (
                <><Text style={wiz.previewSection}>Add-ons ({extras.length})</Text>
                {extras.map((e) => (
                  <View key={e.id} style={wiz.previewItem}>
                    <Text style={wiz.previewItemLabel}>{e.label || '(untitled)'}</Text>
                    <Text style={wiz.previewItemMeta}>${(e.price || 0).toFixed(2)}</Text>
                  </View>
                ))}</>
              )}
            </>
          )}
        </ScrollView>

        {/* Footer nav */}
        <View style={wiz.footer}>
          {step > 0 ? (
            <Pressable style={wiz.backBtn} onPress={prevStep}><Text style={wiz.backBtnText}>Back</Text></Pressable>
          ) : <View />}
          {step < 3 ? (
            <Pressable style={wiz.nextBtn} onPress={nextStep}><Text style={wiz.nextBtnText}>Next</Text></Pressable>
          ) : (
            <Pressable style={[wiz.nextBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={wiz.nextBtnText}>{editing ? 'Update' : 'Create'}</Text>}
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Field Editor Component ───────────────────────────────────────────────────

const FIELD_TYPES: { value: FormField['fieldType']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'multiselect', label: 'Multi-select' },
];

function FieldEditor({
  field,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
}: {
  field: FormField;
  index: number;
  total: number;
  onUpdate: (u: Partial<FormField>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const needsOptions = field.fieldType === 'dropdown' || field.fieldType === 'multiselect';
  const optionsText = (field.options || []).join(', ');

  return (
    <View style={fe.card}>
      <View style={fe.topRow}>
        <Text style={fe.fieldNum}>Q{index + 1}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {index > 0 && <Pressable onPress={() => onMove(-1)} hitSlop={6}><FontAwesome name="arrow-up" size={14} color={Colors.light.textMuted} /></Pressable>}
          {index < total - 1 && <Pressable onPress={() => onMove(1)} hitSlop={6}><FontAwesome name="arrow-down" size={14} color={Colors.light.textMuted} /></Pressable>}
          <Pressable onPress={onRemove} hitSlop={6}><FontAwesome name="trash-o" size={14} color={Colors.light.danger} /></Pressable>
        </View>
      </View>

      <TextInput style={fe.input} value={field.label} onChangeText={(t) => onUpdate({ label: t })} placeholder="Question label" placeholderTextColor={Colors.light.textMuted} />

      {/* Type picker */}
      <View style={fe.typeRow}>
        {FIELD_TYPES.map((ft) => (
          <Pressable key={ft.value} style={[fe.typeChip, field.fieldType === ft.value && fe.typeChipActive]} onPress={() => onUpdate({ fieldType: ft.value })}>
            <Text style={[fe.typeChipText, field.fieldType === ft.value && fe.typeChipTextActive]}>{ft.label}</Text>
          </Pressable>
        ))}
      </View>

      {needsOptions && (
        <>
          <Text style={fe.hint}>Options (comma-separated, min 2)</Text>
          <TextInput style={fe.input} value={optionsText} onChangeText={(t) => onUpdate({ options: t.split(',').map((o) => o.trim()).filter(Boolean) })} placeholder="Option 1, Option 2, ..." placeholderTextColor={Colors.light.textMuted} />
        </>
      )}

      <View style={fe.toggleRow}>
        <Text style={fe.toggleLabel}>Required</Text>
        <Switch value={field.required} onValueChange={(v) => onUpdate({ required: v })} trackColor={{ false: Colors.light.border, true: Colors.light.tint + '60' }} thumbColor={field.required ? Colors.light.tint : Colors.light.textMuted} />
      </View>

      {/* Pricing toggle */}
      <View style={fe.toggleRow}>
        <Text style={fe.toggleLabel}>Affects Price</Text>
        <Switch value={field.hasPricing} onValueChange={(v) => onUpdate({ hasPricing: v, pricingConfig: v ? (field.pricingConfig || {}) : undefined })} trackColor={{ false: Colors.light.border, true: Colors.light.tint + '60' }} thumbColor={field.hasPricing ? Colors.light.tint : Colors.light.textMuted} />
      </View>
      {field.hasPricing && (
        <PricingConfig fieldType={field.fieldType} config={field.pricingConfig || {}} onChange={(c) => onUpdate({ pricingConfig: c })} label="$" />
      )}

      {/* Time toggle */}
      <View style={fe.toggleRow}>
        <Text style={fe.toggleLabel}>Affects Time</Text>
        <Switch value={field.hasTimeImpact} onValueChange={(v) => onUpdate({ hasTimeImpact: v, timeConfig: v ? (field.timeConfig || {}) : undefined })} trackColor={{ false: Colors.light.border, true: Colors.light.tint + '60' }} thumbColor={field.hasTimeImpact ? Colors.light.tint : Colors.light.textMuted} />
      </View>
      {field.hasTimeImpact && (
        <PricingConfig fieldType={field.fieldType} config={field.timeConfig || {}} onChange={(c) => onUpdate({ timeConfig: c })} label="min" />
      )}
    </View>
  );
}

// Generic config editor for pricing or time
function PricingConfig({
  fieldType,
  config,
  onChange,
  label,
}: {
  fieldType: FormField['fieldType'];
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
  label: string;
}) {
  if (fieldType === 'number') {
    const key = label === '$' ? 'pricePerUnit' : 'timePerUnit';
    return (
      <View style={fe.configRow}>
        <Text style={fe.configLabel}>{label} per unit:</Text>
        <TextInput style={[fe.input, { width: 80 }]} value={config[key] != null ? String(config[key]) : ''} onChangeText={(t) => onChange({ ...config, [key]: parseFloat(t) || 0 })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.light.textMuted} />
      </View>
    );
  }
  if (fieldType === 'checkbox') {
    const key = label === '$' ? 'priceWhenChecked' : 'timeWhenChecked';
    return (
      <View style={fe.configRow}>
        <Text style={fe.configLabel}>{label} when checked:</Text>
        <TextInput style={[fe.input, { width: 80 }]} value={config[key] != null ? String(config[key]) : ''} onChangeText={(t) => onChange({ ...config, [key]: parseFloat(t) || 0 })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.light.textMuted} />
      </View>
    );
  }
  if (fieldType === 'multiselect') {
    const key = label === '$' ? 'pricePerSelection' : 'timePerSelection';
    return (
      <View style={fe.configRow}>
        <Text style={fe.configLabel}>{label} per selection:</Text>
        <TextInput style={[fe.input, { width: 80 }]} value={config[key] != null ? String(config[key]) : ''} onChangeText={(t) => onChange({ ...config, [key]: parseFloat(t) || 0 })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.light.textMuted} />
      </View>
    );
  }
  // dropdown: per-option config is complex, simplified to a note
  if (fieldType === 'dropdown') {
    const key = label === '$' ? 'optionPrices' : 'optionTimes';
    return (
      <Text style={[fe.hint, { marginTop: 4 }]}>Per-option {label === '$' ? 'pricing' : 'time'} can be configured after creation on the web app.</Text>
    );
  }
  return null;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.light.text, marginTop: 8 },
  emptySubtitle: { fontSize: 14, color: Colors.light.textMuted, textAlign: 'center', paddingHorizontal: 30 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pageTitle: { fontSize: 22, fontWeight: '700', color: Colors.light.text },
  countBadge: {
    backgroundColor: Colors.light.successLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.light.success },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
  },
  createBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  serviceCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceName: { fontSize: 17, fontWeight: '700', color: Colors.light.text, flexShrink: 1 },
  activeBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeText: { fontSize: 10, fontWeight: '700', color: '#16a34a' },
  inactiveBadge: { backgroundColor: Colors.light.borderLight },
  inactiveBadgeText: { color: Colors.light.textMuted },
  serviceDesc: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 8, lineHeight: 18 },
  serviceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 13, fontWeight: '500', color: Colors.light.textSecondary },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 10,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    backgroundColor: Colors.light.background,
  },
  editBtnText: { fontSize: 14, fontWeight: '600', color: Colors.light.tint },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.dangerLight,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const wiz = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.surface },
  cancelText: { fontSize: 16, color: Colors.light.tint, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: Colors.light.text },
  stepBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, backgroundColor: Colors.light.surface, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  stepItem: { alignItems: 'center', gap: 4 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.light.borderLight, justifyContent: 'center', alignItems: 'center' },
  stepCircleActive: { backgroundColor: Colors.light.tint },
  stepNum: { fontSize: 12, fontWeight: '700', color: Colors.light.textMuted },
  stepNumActive: { color: '#fff' },
  stepLabel: { fontSize: 10, color: Colors.light.textMuted },
  stepLabelActive: { color: Colors.light.tint, fontWeight: '600' },
  body: { flex: 1, padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: Colors.light.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10, fontSize: 15, color: Colors.light.text },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingVertical: 4 },
  switchLabel: { fontSize: 15, fontWeight: '500', color: Colors.light.text },
  sectionHeading: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.light.tint, borderRadius: 6 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  extraRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  previewCard: { backgroundColor: Colors.light.surface, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.light.border },
  previewName: { fontSize: 20, fontWeight: '700', color: Colors.light.text },
  previewDesc: { fontSize: 14, color: Colors.light.textSecondary, marginTop: 4 },
  previewMeta: { fontSize: 13, fontWeight: '500', color: Colors.light.tint },
  previewSection: { fontSize: 15, fontWeight: '700', color: Colors.light.text, marginTop: 12, marginBottom: 8 },
  previewItem: { backgroundColor: Colors.light.surface, borderRadius: 8, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: Colors.light.borderLight },
  previewItemLabel: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  previewItemMeta: { fontSize: 12, color: Colors.light.textMuted, marginTop: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.light.border, backgroundColor: Colors.light.surface },
  backBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border },
  backBtnText: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  nextBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, backgroundColor: Colors.light.tint },
  nextBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

const fe = StyleSheet.create({
  card: { backgroundColor: Colors.light.surface, borderRadius: 10, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.light.border },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  fieldNum: { fontSize: 13, fontWeight: '700', color: Colors.light.tint },
  input: { backgroundColor: Colors.light.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 11 : 8, fontSize: 14, color: Colors.light.text, marginBottom: 8 },
  hint: { fontSize: 11, color: Colors.light.textMuted, marginBottom: 6 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  typeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.background },
  typeChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  typeChipText: { fontSize: 12, fontWeight: '500', color: Colors.light.textSecondary },
  typeChipTextActive: { color: '#fff' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  toggleLabel: { fontSize: 13, fontWeight: '500', color: Colors.light.text },
  configRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 },
  configLabel: { fontSize: 12, color: Colors.light.textSecondary, flex: 1 },
});
