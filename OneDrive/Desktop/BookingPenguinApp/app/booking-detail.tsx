import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import {
  getBooking,
  updateBooking,
  deleteBooking,
  getStatusInfo,
  createStaffPayment,
  addCompanyRevenue,
  createNotification,
} from '@/services/bookings';
import { getBusinessMembers } from '@/services/business';
import { getStaffHourlyRate, subscribeToStaffRates } from '@/services/staff';
import Colors from '@/constants/Colors';
import type {
  BookingDoc,
  BookingStatus,
  AssignedStaffEntry,
  BusinessMember,
  StaffRateDoc,
} from '@/types';

function recalcEqualSplits(staff: AssignedStaffEntry[]): AssignedStaffEntry[] {
  if (staff.length === 0) return staff;
  if (staff.length === 1) {
    staff[0].splitPercent = 100;
    return staff;
  }
  const equalSplit = Math.floor(100 / staff.length);
  let remainder = 100 - equalSplit * staff.length;
  staff.forEach((s, i) => {
    s.splitPercent = equalSplit + (i === 0 ? remainder : 0);
  });
  return staff;
}

function redistributeSplits(
  staff: AssignedStaffEntry[],
  changedId: string,
  newPercent: number
): AssignedStaffEntry[] {
  const pct = Math.max(1, Math.min(99, newPercent));
  const target = staff.find((s) => s.staffId === changedId);
  if (!target) return staff;
  target.splitPercent = pct;

  const othersTotal = 100 - pct;
  const others = staff.filter((s) => s.staffId !== changedId);
  const othersCurrentSum = others.reduce((sum, s) => sum + s.splitPercent, 0);

  if (othersCurrentSum > 0) {
    others.forEach((s) => {
      s.splitPercent = Math.max(1, Math.round((s.splitPercent / othersCurrentSum) * othersTotal));
    });
  } else {
    const equalShare = Math.floor(othersTotal / others.length);
    others.forEach((s) => {
      s.splitPercent = equalShare;
    });
  }

  const totalNow = staff.reduce((sum, s) => sum + s.splitPercent, 0);
  if (totalNow !== 100 && others.length > 0) {
    others[0].splitPercent += 100 - totalNow;
  }
  return [...staff];
}

export default function BookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { role, businessId, userDoc, firebaseUser } = useAuth();
  const [booking, setBooking] = useState<BookingDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [staffRates, setStaffRates] = useState<StaffRateDoc[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const splitSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = role === 'owner' || role === 'admin';
  const customUserId = userDoc?.id || '';
  const adminName = userDoc
    ? `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim()
    : 'Admin';

  useEffect(() => {
    if (!bookingId) return;
    loadBooking();
  }, [bookingId]);

  useEffect(() => {
    if (!businessId) return;
    getBusinessMembers(businessId).then(setMembers).catch(console.error);
    const unsub = subscribeToStaffRates(businessId, setStaffRates);
    return unsub;
  }, [businessId]);

  const loadBooking = async () => {
    try {
      const data = await getBooking(bookingId!);
      setBooking(data);
    } catch (error) {
      console.error('Failed to load booking:', error);
    } finally {
      setLoading(false);
    }
  };

  const staffMembers = useMemo(
    () => members.filter((m) => m.membership?.role === 'staff'),
    [members]
  );

  const assignableStaff = useMemo(() => {
    const assignedIds = new Set((booking?.assignedStaff || []).map((s) => s.staffId));
    return staffMembers.filter((m) => !assignedIds.has(m.id));
  }, [staffMembers, booking?.assignedStaff]);

  const rateMap = useMemo(() => {
    const map: Record<string, number> = {};
    staffRates.forEach((r) => {
      map[r.staffId] = r.hourlyRate;
    });
    return map;
  }, [staffRates]);

  const assignedStaff = booking?.assignedStaff || [];
  const isCompleted = booking?.status === 'completed';
  const isCancelled = booking?.status === 'cancelled';
  const canModifyAssignment = isAdmin && !isCompleted && !isCancelled;

  const handleAddStaff = async (member: BusinessMember) => {
    if (!booking || !canModifyAssignment) return;
    setShowAssignModal(false);
    setUpdating(true);
    try {
      const newEntry: AssignedStaffEntry = {
        staffId: member.id,
        staffName: `${member.firstName} ${member.lastName}`.trim(),
        splitPercent: 0,
      };
      const newStaff = recalcEqualSplits([...assignedStaff, newEntry]);
      const primary = newStaff.find((s) => !s.isAdmin) || newStaff[0];
      const wasStatus = booking.status;

      await updateBooking(booking.id, {
        assignedStaff: newStaff,
        staffCount: newStaff.length,
        assignedTo: primary.staffId,
        assignedToName: primary.staffName,
        assignedToType: null,
        assignedAt: 'SERVER_TIMESTAMP',
        status: wasStatus === 'pending' ? 'assigned' : wasStatus,
      });

      if (member.authUid) {
        createNotification({
          userId: member.authUid,
          title: 'New Job Assigned',
          message: `You have been assigned to ${booking.serviceName} on ${booking.date}`,
          type: 'booking_assigned',
          bookingId: booking.id,
          businessId: businessId!,
        }).catch(console.error);
      }

      await loadBooking();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to assign staff.');
    } finally {
      setUpdating(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!booking || !canModifyAssignment || !customUserId) return;

    const alreadyAssigned = assignedStaff.some((s) => s.staffId === customUserId);
    if (alreadyAssigned) {
      Alert.alert('Already Assigned', 'You are already assigned to this booking.');
      return;
    }

    setUpdating(true);
    try {
      if (assignedStaff.length === 0) {
        await updateBooking(booking.id, {
          assignedTo: customUserId,
          assignedToName: adminName,
          assignedToType: 'admin',
          assignedStaff: [
            { staffId: customUserId, staffName: adminName, splitPercent: 100, isAdmin: true },
          ],
          staffCount: 1,
          assignedAt: 'SERVER_TIMESTAMP',
          status: 'accepted',
        });
      } else {
        const newStaff = recalcEqualSplits([
          { staffId: customUserId, staffName: adminName, splitPercent: 0, isAdmin: true },
          ...assignedStaff,
        ]);
        const firstNonAdmin = newStaff.find((s) => !s.isAdmin) || newStaff[0];

        await updateBooking(booking.id, {
          assignedStaff: newStaff,
          staffCount: newStaff.length,
          assignedTo: firstNonAdmin.staffId,
          assignedToName: firstNonAdmin.staffName,
          assignedToType: null,
          assignedAt: 'SERVER_TIMESTAMP',
          status: booking.status === 'pending' ? 'assigned' : booking.status,
        });
      }
      await loadBooking();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to assign.');
    } finally {
      setUpdating(false);
    }
  };

  const handleRemoveStaff = async (staffId: string, staffName: string) => {
    if (!booking || !canModifyAssignment) return;

    Alert.alert('Remove Staff', `Remove ${staffName} from this booking?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setUpdating(true);
          try {
            const remaining = assignedStaff.filter((s) => s.staffId !== staffId);
            const member = members.find((m) => m.id === staffId);

            if (remaining.length === 0) {
              await updateBooking(booking.id, {
                assignedStaff: null,
                staffCount: 0,
                assignedTo: null,
                assignedToName: null,
                assignedToType: null,
                assignedAt: null,
                status: 'pending',
              });
            } else {
              recalcEqualSplits(remaining);
              const primary = remaining.find((s) => !s.isAdmin) || remaining[0];
              await updateBooking(booking.id, {
                assignedStaff: remaining,
                staffCount: remaining.length,
                assignedTo: primary.staffId,
                assignedToName: primary.staffName,
                assignedToType:
                  remaining.length === 1 && remaining[0].isAdmin ? 'admin' : null,
              });
            }

            if (member?.authUid) {
              createNotification({
                userId: member.authUid,
                title: 'Booking Unassigned',
                message: `You have been removed from ${booking.serviceName} on ${booking.date}`,
                type: 'booking_assigned',
                bookingId: booking.id,
                businessId: businessId!,
              }).catch(console.error);
            }

            await loadBooking();
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to remove staff.');
          } finally {
            setUpdating(false);
          }
        },
      },
    ]);
  };

  const handleSplitChange = useCallback(
    (staffId: string, newPercent: number) => {
      if (!booking || assignedStaff.length < 2) return;
      const updated = redistributeSplits([...assignedStaff], staffId, newPercent);
      setBooking({ ...booking, assignedStaff: updated });

      if (splitSaveTimer.current) clearTimeout(splitSaveTimer.current);
      splitSaveTimer.current = setTimeout(async () => {
        try {
          await updateBooking(booking.id, { assignedStaff: updated });
        } catch (err) {
          console.error('Failed to save splits:', err);
        }
      }, 800);
    },
    [booking, assignedStaff]
  );

  const handleMarkComplete = async () => {
    if (!booking) return;

    const allowed: BookingStatus[] = ['accepted', 'assigned', 'confirmed', 'in_progress'];
    if (!allowed.includes(booking.status)) {
      Alert.alert('Cannot Complete', 'This booking cannot be marked as completed in its current state.');
      return;
    }

    Alert.alert('Mark Complete', 'Mark this booking as completed? This will create payment records.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: async () => {
          setUpdating(true);
          try {
            await updateBooking(booking.id, {
              status: 'completed',
              completedAt: 'SERVER_TIMESTAMP',
              completedBy: firebaseUser?.uid,
              completedByAdmin: true,
            });

            const staff = booking.assignedStaff || [];
            if (staff.length > 0) {
              const isAdminOnlyJob = staff.length === 1 && staff[0].isAdmin;
              const estMinutes = booking.estimatedTimeMinutes || 0;

              if (isAdminOnlyJob) {
                await addCompanyRevenue({
                  businessId: businessId!,
                  bookingId: booking.id,
                });
              } else {
                const staffOnly = staff.filter((s) => !s.isAdmin);
                for (const s of staffOnly) {
                  const hourlyRate = await getStaffHourlyRate(businessId!, s.staffId);
                  const splitMinutes = Math.round(estMinutes * (s.splitPercent / 100));

                  await createStaffPayment({
                    businessId: businessId!,
                    bookingId: booking.id,
                    hourlyRate,
                    staffName: s.staffName,
                    splitStaffId: s.staffId,
                    splitPercent: s.splitPercent,
                    splitMinutes,
                    totalStaffOnJob: staff.length,
                  });
                }
              }
            }

            await loadBooking();
            Alert.alert('Success', 'Booking marked as completed.');
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to complete booking.');
          } finally {
            setUpdating(false);
          }
        },
      },
    ]);
  };

  const handleStatusChange = async (newStatus: BookingStatus) => {
    if (!booking) return;

    if (newStatus === 'completed') {
      handleMarkComplete();
      return;
    }

    const statusLabels: Record<string, string> = {
      confirmed: 'Confirm',
      assigned: 'Assign',
      accepted: 'Accept',
      in_progress: 'Start',
      cancelled: 'Cancel',
    };

    Alert.alert(
      `${statusLabels[newStatus] || newStatus} Booking?`,
      `Are you sure you want to mark this booking as ${newStatus.replace('_', ' ')}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: newStatus === 'cancelled' ? 'destructive' : 'default',
          onPress: async () => {
            setUpdating(true);
            try {
              await updateBooking(booking.id, { status: newStatus });
              setBooking({ ...booking, status: newStatus });
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to update booking.');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    if (!booking) return;
    Alert.alert('Delete Booking?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setUpdating(true);
          try {
            await deleteBooking(booking.id);
            router.back();
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to delete booking.');
            setUpdating(false);
          }
        },
      },
    ]);
  };

  // Payment preview calculation
  const paymentPreview = useMemo(() => {
    if (!booking || assignedStaff.length === 0) return null;
    const isSoloAdmin = assignedStaff.length === 1 && assignedStaff[0].isAdmin;
    if (isSoloAdmin) return null;

    const estMinutes = booking.estimatedTimeMinutes || 0;
    const jobTotal = booking.pricing?.total || 0;
    let totalStaffCost = 0;

    const items = assignedStaff.map((s) => {
      const splitMinutes = Math.round(estMinutes * (s.splitPercent / 100));
      if (s.isAdmin) {
        return { ...s, splitMinutes, hourlyRate: 0, payment: 0, isCompany: true };
      }
      const hourlyRate = rateMap[s.staffId] || 0;
      const payment = (hourlyRate * splitMinutes) / 60;
      totalStaffCost += payment;
      return { ...s, splitMinutes, hourlyRate, payment, isCompany: false };
    });

    return { items, totalStaffCost, businessProfit: jobTotal - totalStaffCost };
  }, [booking, assignedStaff, rateMap]);

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Booking',
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

  if (!booking) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Booking',
            headerStyle: { backgroundColor: Colors.light.headerBg },
            headerTintColor: Colors.light.headerText,
          }}
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Booking not found.</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </>
    );
  }

  const customerName =
    `${booking.customer?.firstName || ''} ${booking.customer?.lastName || ''}`.trim() ||
    'No customer';
  const { label: statusLabel, colorKey } = getStatusInfo(booking.status);
  const statusColor = Colors.light[colorKey];

  const formatAddress = () => {
    const addr = booking.address;
    if (!addr) return null;
    if (typeof addr === 'string') return addr;
    const parts = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  const canComplete =
    booking.status === 'accepted' ||
    booking.status === 'assigned' ||
    booking.status === 'confirmed' ||
    booking.status === 'in_progress';

  return (
    <>
      <Stack.Screen
        options={{
          title: booking.serviceName || 'Booking',
          headerStyle: { backgroundColor: Colors.light.headerBg },
          headerTintColor: Colors.light.headerText,
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusColor + '12' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusBannerText, { color: statusColor }]}>{statusLabel}</Text>
        </View>

        {/* Service Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service</Text>
          <Text style={styles.serviceNameLarge}>{booking.serviceName || 'Untitled'}</Text>
          {booking.serviceDescription ? (
            <Text style={styles.serviceDesc}>{booking.serviceDescription}</Text>
          ) : null}
        </View>

        {/* Date & Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date & Time</Text>
          <View style={styles.infoRow}>
            <FontAwesome name="calendar" size={14} color={Colors.light.textSecondary} />
            <Text style={styles.infoValue}>
              {booking.date
                ? format(new Date(booking.date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')
                : 'No date'}
            </Text>
          </View>
          {booking.time && (
            <View style={styles.infoRow}>
              <FontAwesome name="clock-o" size={14} color={Colors.light.textSecondary} />
              <Text style={styles.infoValue}>{booking.time}</Text>
            </View>
          )}
          {booking.estimatedTimeMinutes ? (
            <View style={styles.infoRow}>
              <FontAwesome name="hourglass-half" size={14} color={Colors.light.textSecondary} />
              <Text style={styles.infoValue}>{booking.estimatedTimeMinutes} minutes</Text>
            </View>
          ) : null}
        </View>

        {/* Customer */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <View style={styles.infoRow}>
            <FontAwesome name="user" size={14} color={Colors.light.textSecondary} />
            <Text style={styles.infoValue}>{customerName}</Text>
          </View>
          {booking.customer?.email ? (
            <View style={styles.infoRow}>
              <FontAwesome name="envelope" size={13} color={Colors.light.textSecondary} />
              <Text style={styles.infoValue}>{booking.customer.email}</Text>
            </View>
          ) : null}
          {booking.customer?.phone ? (
            <View style={styles.infoRow}>
              <FontAwesome name="phone" size={14} color={Colors.light.textSecondary} />
              <Text style={styles.infoValue}>{booking.customer.phone}</Text>
            </View>
          ) : null}
        </View>

        {/* Address */}
        {formatAddress() && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Address</Text>
            <View style={styles.infoRow}>
              <FontAwesome name="map-marker" size={14} color={Colors.light.textSecondary} />
              <Text style={styles.infoValue}>{formatAddress()}</Text>
            </View>
          </View>
        )}

        {/* ── Staff Assignment Section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assigned Staff</Text>

          {assignedStaff.length === 0 ? (
            <Text style={styles.unassigned}>No staff assigned yet</Text>
          ) : (
            assignedStaff.map((entry) => (
              <View key={entry.staffId} style={styles.staffRow}>
                <View style={styles.staffInfo}>
                  <View style={styles.staffAvatar}>
                    <Text style={styles.staffAvatarText}>
                      {entry.staffName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.staffNameCol}>
                    <Text style={styles.staffName}>{entry.staffName}</Text>
                    {entry.isAdmin && (
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>Admin</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.staffRight}>
                  {assignedStaff.length > 1 ? (
                    <View style={styles.splitInput}>
                      <TextInput
                        style={styles.splitField}
                        keyboardType="numeric"
                        value={String(entry.splitPercent)}
                        onChangeText={(val) => {
                          const num = parseInt(val) || 0;
                          handleSplitChange(entry.staffId, num);
                        }}
                        editable={canModifyAssignment}
                        maxLength={3}
                      />
                      <Text style={styles.splitPercent}>%</Text>
                    </View>
                  ) : (
                    <Text style={styles.soloSplit}>100%</Text>
                  )}

                  {canModifyAssignment && (
                    <Pressable
                      style={styles.removeBtn}
                      onPress={() => handleRemoveStaff(entry.staffId, entry.staffName)}
                      hitSlop={8}
                    >
                      <FontAwesome name="times-circle" size={20} color={Colors.light.danger} />
                    </Pressable>
                  )}
                </View>
              </View>
            ))
          )}

          {/* Assignment Buttons */}
          {canModifyAssignment && (
            <View style={styles.assignActions}>
              <Pressable
                style={styles.addStaffBtn}
                onPress={() => setShowAssignModal(true)}
                disabled={assignableStaff.length === 0}
              >
                <FontAwesome name="user-plus" size={14} color={Colors.light.tint} />
                <Text style={styles.addStaffText}>Add Staff</Text>
              </Pressable>

              {!assignedStaff.some((s) => s.staffId === customUserId) && (
                <Pressable style={styles.assignMeBtn} onPress={handleAssignToMe}>
                  <FontAwesome name="hand-o-up" size={14} color="#fff" />
                  <Text style={styles.assignMeText}>Assign to Me</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* ── Payment Preview ── */}
        {paymentPreview && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Preview</Text>
            {paymentPreview.items.map((item) => (
              <View key={item.staffId} style={styles.previewRow}>
                <View style={styles.previewLeft}>
                  <Text style={styles.previewName}>{item.staffName}</Text>
                  <Text style={styles.previewMeta}>
                    {item.splitPercent}% · {item.splitMinutes} min
                    {!item.isCompany && item.hourlyRate > 0 ? ` · $${item.hourlyRate}/hr` : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.previewAmount,
                    item.isCompany && { color: Colors.light.tint },
                  ]}
                >
                  {item.isCompany ? 'Company' : `$${item.payment.toFixed(2)}`}
                </Text>
              </View>
            ))}
            <View style={styles.previewDivider} />
            <View style={styles.previewSummaryRow}>
              <Text style={styles.previewSummaryLabel}>Total Staff Cost</Text>
              <Text style={styles.previewSummaryVal}>
                ${paymentPreview.totalStaffCost.toFixed(2)}
              </Text>
            </View>
            <View style={styles.previewSummaryRow}>
              <Text style={[styles.previewSummaryLabel, { fontWeight: '700' }]}>
                Business Profit
              </Text>
              <Text
                style={[
                  styles.previewSummaryVal,
                  {
                    fontWeight: '700',
                    color:
                      paymentPreview.businessProfit >= 0
                        ? Colors.light.success
                        : Colors.light.danger,
                  },
                ]}
              >
                ${paymentPreview.businessProfit.toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Pricing */}
        {booking.pricing && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pricing</Text>
            {booking.pricing.basePrice != null && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Base Price</Text>
                <Text style={styles.priceValue}>${booking.pricing.basePrice.toFixed(2)}</Text>
              </View>
            )}
            {(booking.pricing.fieldCharges ?? 0) > 0 && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Options</Text>
                <Text style={styles.priceValue}>${booking.pricing.fieldCharges.toFixed(2)}</Text>
              </View>
            )}
            {(booking.pricing.extrasTotal ?? 0) > 0 && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Extras</Text>
                <Text style={styles.priceValue}>${booking.pricing.extrasTotal.toFixed(2)}</Text>
              </View>
            )}
            {(booking.pricing.tax ?? 0) > 0 && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Tax</Text>
                <Text style={styles.priceValue}>${booking.pricing.tax.toFixed(2)}</Text>
              </View>
            )}
            <View style={[styles.priceRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${booking.pricing.total.toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Notes */}
        {(booking.notes || booking.customerNotes) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            {booking.notes ? <Text style={styles.notesText}>{booking.notes}</Text> : null}
            {booking.customerNotes ? (
              <>
                <Text style={styles.notesLabel}>Customer Notes:</Text>
                <Text style={styles.notesText}>{booking.customerNotes}</Text>
              </>
            ) : null}
          </View>
        )}

        {/* Action Buttons (Admin/Owner only) */}
        {isAdmin && (
          <View style={styles.actions}>
            {booking.status === 'pending' && (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: Colors.light.tint }]}
                onPress={() => handleStatusChange('confirmed')}
                disabled={updating}
              >
                <FontAwesome name="check" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>Confirm</Text>
              </Pressable>
            )}
            {(booking.status === 'assigned' || booking.status === 'confirmed') && (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: Colors.light.tint }]}
                onPress={() => handleStatusChange('in_progress')}
                disabled={updating}
              >
                <FontAwesome name="play" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>Start</Text>
              </Pressable>
            )}
            {canComplete && (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: Colors.light.success }]}
                onPress={handleMarkComplete}
                disabled={updating}
              >
                <FontAwesome name="check-circle" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>Mark Complete</Text>
              </Pressable>
            )}
            {!isCancelled && !isCompleted && (
              <Pressable
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={() => handleStatusChange('cancelled')}
                disabled={updating}
              >
                <FontAwesome name="times" size={14} color={Colors.light.danger} />
                <Text style={[styles.actionBtnText, { color: Colors.light.danger }]}>Cancel</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={handleDelete}
              disabled={updating}
            >
              <FontAwesome name="trash" size={14} color={Colors.light.danger} />
              <Text style={[styles.actionBtnText, { color: Colors.light.danger }]}>Delete</Text>
            </Pressable>
          </View>
        )}

        {updating && (
          <View style={styles.updatingOverlay}>
            <ActivityIndicator color={Colors.light.tint} />
          </View>
        )}
      </ScrollView>

      {/* ── Staff Selection Modal ── */}
      <Modal visible={showAssignModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Staff Member</Text>
              <Pressable onPress={() => setShowAssignModal(false)} hitSlop={8}>
                <FontAwesome name="times" size={20} color={Colors.light.text} />
              </Pressable>
            </View>

            {assignableStaff.length === 0 ? (
              <Text style={styles.noStaffText}>No available staff to assign.</Text>
            ) : (
              <ScrollView style={styles.staffList}>
                {assignableStaff.map((m) => (
                  <Pressable
                    key={m.id}
                    style={styles.staffOption}
                    onPress={() => handleAddStaff(m)}
                  >
                    <View style={styles.staffAvatar}>
                      <Text style={styles.staffAvatarText}>
                        {(m.firstName || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.staffOptionName}>
                        {m.firstName} {m.lastName}
                      </Text>
                      <Text style={styles.staffOptionEmail}>{m.email}</Text>
                    </View>
                    {rateMap[m.id] ? (
                      <Text style={styles.rateTag}>${rateMap[m.id]}/hr</Text>
                    ) : (
                      <Text style={styles.noRateTag}>No rate</Text>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
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
  errorText: { fontSize: 16, color: Colors.light.textSecondary, marginBottom: 16 },
  backButton: {
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backButtonText: { color: '#fff', fontWeight: '600' },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusBannerText: { fontSize: 14, fontWeight: '600' },

  section: {
    backgroundColor: Colors.light.surface,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  serviceNameLarge: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  serviceDesc: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  infoValue: { fontSize: 15, color: Colors.light.text, flex: 1 },
  unassigned: { fontSize: 14, color: Colors.light.textMuted, fontStyle: 'italic' },

  // Staff assignment
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  staffInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  staffAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.tint + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffAvatarText: { fontSize: 14, fontWeight: '700', color: Colors.light.tint },
  staffNameCol: { flex: 1 },
  staffName: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  adminBadge: {
    backgroundColor: Colors.light.tint + '18',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  adminBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.light.tint },

  staffRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  splitInput: { flexDirection: 'row', alignItems: 'center' },
  splitField: {
    width: 42,
    height: 32,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    backgroundColor: Colors.light.background,
  },
  splitPercent: { fontSize: 13, color: Colors.light.textMuted, marginLeft: 2 },
  soloSplit: { fontSize: 14, fontWeight: '600', color: Colors.light.textMuted },
  removeBtn: { padding: 4 },

  assignActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  addStaffBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.light.tint,
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  addStaffText: { fontSize: 13, fontWeight: '600', color: Colors.light.tint },
  assignMeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
  },
  assignMeText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  // Payment preview
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  previewLeft: { flex: 1 },
  previewName: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  previewMeta: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  previewAmount: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  previewDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 10,
  },
  previewSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  previewSummaryLabel: { fontSize: 14, color: Colors.light.textSecondary },
  previewSummaryVal: { fontSize: 14, fontWeight: '600', color: Colors.light.text },

  // Pricing
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  priceLabel: { fontSize: 14, color: Colors.light.textSecondary },
  priceValue: { fontSize: 14, color: Colors.light.text, fontWeight: '500' },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    marginTop: 6,
    paddingTop: 8,
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  totalValue: { fontSize: 15, fontWeight: '700', color: Colors.light.text },

  notesLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginTop: 8,
    marginBottom: 4,
  },
  notesText: { fontSize: 14, color: Colors.light.text, lineHeight: 20 },

  // Actions
  actions: { marginHorizontal: 16, marginTop: 20, gap: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  actionBtnText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  cancelBtn: {
    backgroundColor: Colors.light.dangerLight,
    borderWidth: 1,
    borderColor: Colors.light.danger + '30',
  },
  deleteBtn: {
    backgroundColor: Colors.light.dangerLight,
    borderWidth: 1,
    borderColor: Colors.light.danger + '30',
  },
  updatingOverlay: { alignItems: 'center', marginTop: 12 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.light.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  noStaffText: {
    fontSize: 14,
    color: Colors.light.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  staffList: { maxHeight: 400 },
  staffOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
    gap: 10,
  },
  staffOptionName: { fontSize: 15, fontWeight: '600', color: Colors.light.text },
  staffOptionEmail: { fontSize: 12, color: Colors.light.textSecondary },
  rateTag: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.success,
    backgroundColor: Colors.light.successLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  noRateTag: {
    fontSize: 12,
    color: Colors.light.textMuted,
    fontStyle: 'italic',
  },
});
