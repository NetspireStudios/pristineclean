import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToChats, createChat, getChatUnreadCount } from '@/services/chat';
import { getBusinessMembers } from '@/services/business';
import Colors from '@/constants/Colors';
import type { ChatDoc, BusinessMember, ChatParticipantDetail } from '@/types';

export default function ChatList() {
  const { businessId, userDoc, role, firebaseUser } = useAuth();
  const [chats, setChats] = useState<ChatDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allMembers, setAllMembers] = useState<BusinessMember[]>([]);

  const [showNewChat, setShowNewChat] = useState(false);
  const [chatName, setChatName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const authUid = firebaseUser?.uid || '';
  const userDocId = userDoc?.id || '';
  const userName = userDoc
    ? `${userDoc.firstName} ${userDoc.lastName}`.trim()
    : 'User';

  const { nameLookup, photoLookup } = useMemo(() => {
    const names: Record<string, string> = {};
    const photos: Record<string, string> = {};
    allMembers.forEach((m) => {
      const name = `${m.firstName} ${m.lastName}`.trim();
      if (m.id) {
        names[m.id] = name;
        if (m.photoUrl) photos[m.id] = m.photoUrl;
      }
      if (m.authUid) {
        names[m.authUid] = name;
        if (m.photoUrl) photos[m.authUid] = m.photoUrl;
      }
    });
    if (userDocId) names[userDocId] = userName;
    if (authUid) names[authUid] = userName;
    return { nameLookup: names, photoLookup: photos };
  }, [allMembers, userDocId, authUid, userName]);

  useEffect(() => {
    if (!businessId || !authUid) return;

    getBusinessMembers(businessId).then(setAllMembers).catch(() => {});

    const unsub = subscribeToChats(
      businessId,
      authUid,
      (data) => {
        setChats(data);
        setLoading(false);
        setRefreshing(false);
      },
      () => {
        setLoading(false);
        setRefreshing(false);
      }
    );
    return unsub;
  }, [businessId, authUid]);

  function getChatDisplayName(chat: ChatDoc): string {
    if (chat.type === 'team' && chat.name) return chat.name;

    // Use participantDetails first (new format)
    if (chat.participantDetails) {
      const otherNames = Object.entries(chat.participantDetails)
        .filter(([id]) => id !== authUid && id !== userDocId)
        .map(([, d]) => `${d.firstName} ${d.lastName}`.trim())
        .filter(Boolean);
      if (otherNames.length > 0) return otherNames.join(', ');
    }

    // Fallback to participantNames (legacy format)
    if (chat.participantNames) {
      const otherNames = Object.entries(chat.participantNames)
        .filter(([id]) => id !== authUid && id !== userDocId)
        .map(([, n]) => (typeof n === 'string' ? n : ''))
        .filter(Boolean);
      if (otherNames.length > 0) return otherNames.join(', ');
    }

    // Fallback to member lookup
    if (chat.participants) {
      const otherNames = chat.participants
        .filter((id) => id !== authUid && id !== userDocId)
        .map((id) => nameLookup[id])
        .filter(Boolean);
      if (otherNames.length > 0) return otherNames.join(', ');
    }

    return chat.name || 'Chat';
  }

  function getChatPhoto(chat: ChatDoc): string | null {
    if (chat.type === 'team') return null;
    const otherId = chat.participants?.find(
      (id) => id !== authUid && id !== userDocId
    );
    if (!otherId) return null;
    // Check participantDetails first
    if (chat.participantDetails?.[otherId]?.photoUrl) {
      return chat.participantDetails[otherId].photoUrl;
    }
    return photoLookup[otherId] || null;
  }

  function getTimeAgo(chat: ChatDoc): string {
    const ts = chat.lastMessageAt;
    if (!ts) return '';
    // Handle lastMessage.timestamp nested in the lastMessage object
    let seconds = 0;
    if (typeof ts === 'object' && 'seconds' in ts) seconds = (ts as any).seconds;
    else if (typeof ts === 'number') seconds = ts;
    if (!seconds) return '';
    const diff = Date.now() - seconds * 1000;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }

  function getLastMessageText(chat: ChatDoc): string | null {
    if (!chat.lastMessage) return null;
    if (typeof chat.lastMessage === 'string') return chat.lastMessage || null;
    if (typeof chat.lastMessage === 'object') {
      const msg = chat.lastMessage as any;
      if (msg.deleted) return 'Message deleted';
      if (msg.text) return String(msg.text);
    }
    return null;
  }

  function openChat(chat: ChatDoc) {
    const name = getChatDisplayName(chat);
    router.push({
      pathname: '/chat-room',
      params: { chatId: chat.id, chatName: name, chatType: chat.type || 'direct' },
    });
  }

  const otherMembers = useMemo(
    () => allMembers.filter((m) => m.authUid !== authUid && m.id !== userDocId),
    [allMembers, authUid, userDocId]
  );

  function toggleMember(id: string) {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  async function openNewChatModal() {
    setShowNewChat(true);
    setChatName('');
    setSelectedMembers([]);
    if (allMembers.length === 0 && businessId) {
      try {
        const fetched = await getBusinessMembers(businessId);
        setAllMembers(fetched);
      } catch {
        Alert.alert('Error', 'Failed to load team members.');
      }
    }
  }

  async function handleCreateChat() {
    if (!businessId || selectedMembers.length === 0) {
      Alert.alert('Select Members', 'Please select at least one member.');
      return;
    }
    setCreating(true);
    try {
      const selectedAuthUids = selectedMembers
        .map((id) => allMembers.find((mem) => mem.id === id)?.authUid)
        .filter(Boolean) as string[];

      const participants = [authUid, ...selectedAuthUids];

      // Build participantDetails with full user info
      const participantDetails: Record<string, ChatParticipantDetail> = {
        [authUid]: {
          firstName: userDoc?.firstName || '',
          lastName: userDoc?.lastName || '',
          email: userDoc?.email || '',
          role: role || 'admin',
          photoUrl: userDoc?.photoUrl || null,
        },
      };
      selectedMembers.forEach((id) => {
        const m = allMembers.find((mem) => mem.id === id);
        if (m?.authUid) {
          participantDetails[m.authUid] = {
            firstName: m.firstName,
            lastName: m.lastName,
            email: m.email || '',
            role: m.membership?.role || 'staff',
            photoUrl: m.photoUrl || null,
          };
        }
      });

      const isDirect = selectedAuthUids.length === 1;
      const displayName =
        chatName.trim() ||
        (isDirect
          ? `${participantDetails[selectedAuthUids[0]]?.firstName || ''} ${participantDetails[selectedAuthUids[0]]?.lastName || ''}`.trim() || 'Chat'
          : 'Team Chat');

      const chatId = await createChat({
        businessId,
        type: isDirect ? 'direct' : 'team',
        name: displayName,
        participants,
        participantDetails,
      });

      setShowNewChat(false);
      router.push({
        pathname: '/chat-room',
        params: { chatId, chatName: displayName, chatType: isDirect ? 'direct' : 'team' },
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create chat.');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading chats...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} tintColor={Colors.light.tint} />
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Chat</Text>
          <Pressable style={styles.newChatBtn} onPress={openNewChatModal}>
            <FontAwesome name="plus" size={14} color="#fff" />
            <Text style={styles.newChatText}>New</Text>
          </Pressable>
        </View>

        {chats.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome name="comments-o" size={48} color={Colors.light.textMuted} />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtext}>Start a new chat with your team.</Text>
          </View>
        ) : (
          chats.map((chat) => {
            const displayName = getChatDisplayName(chat);
            const photo = getChatPhoto(chat);
            const initials = displayName
              .split(' ')
              .map((w) => w[0])
              .join('')
              .substring(0, 2)
              .toUpperCase();
            const lastMsg = getLastMessageText(chat);
            const unreadCount = getChatUnreadCount(chat, authUid);
            const isUnread = unreadCount > 0;

            return (
              <Pressable
                key={chat.id}
                style={({ pressed }) => [
                  styles.chatRow,
                  isUnread && styles.chatRowUnread,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => openChat(chat)}
              >
                {/* Avatar */}
                {chat.type === 'team' ? (
                  <View style={[styles.avatar, styles.avatarTeam]}>
                    <FontAwesome name="users" size={16} color="#fff" />
                  </View>
                ) : photo ? (
                  <Image source={{ uri: photo }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatar, styles.avatarDirect]}>
                    <Text style={styles.avatarText}>{initials || 'C'}</Text>
                  </View>
                )}

                {/* Chat info */}
                <View style={styles.chatInfo}>
                  <View style={styles.chatTopRow}>
                    <Text
                      style={[styles.chatName, isUnread && styles.chatNameUnread]}
                      numberOfLines={1}
                    >
                      {displayName}
                    </Text>
                    <Text style={[styles.chatTime, isUnread && styles.chatTimeUnread]}>
                      {getTimeAgo(chat)}
                    </Text>
                  </View>
                  {lastMsg ? (
                    <Text
                      style={[styles.lastMsg, isUnread && styles.lastMsgUnread]}
                      numberOfLines={1}
                    >
                      {lastMsg}
                    </Text>
                  ) : (
                    <Text style={styles.noMsg}>No messages yet</Text>
                  )}
                </View>

                {/* Unread badge with count OR chevron */}
                {isUnread ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                ) : (
                  <FontAwesome name="chevron-right" size={12} color={Colors.light.textMuted} />
                )}
              </Pressable>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* New Chat Modal */}
      <Modal visible={showNewChat} transparent animationType="slide" onRequestClose={() => setShowNewChat(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Chat</Text>
              <Pressable onPress={() => setShowNewChat(false)} hitSlop={12}>
                <FontAwesome name="times" size={20} color={Colors.light.textSecondary} />
              </Pressable>
            </View>

            <TextInput
              style={styles.nameInput}
              placeholder="Chat name (optional)"
              placeholderTextColor={Colors.light.textMuted}
              value={chatName}
              onChangeText={setChatName}
            />

            <Text style={styles.selectLabel}>Select members:</Text>

            {otherMembers.length === 0 ? (
              <Text style={styles.noMembers}>No other members found.</Text>
            ) : (
              <ScrollView style={styles.membersList}>
                {otherMembers.map((m) => {
                  const selected = selectedMembers.includes(m.id);
                  const mi = `${m.firstName?.[0] || ''}${m.lastName?.[0] || ''}`.toUpperCase();
                  return (
                    <Pressable key={m.id} style={styles.memberRow} onPress={() => toggleMember(m.id)}>
                      <View style={[styles.checkbox, selected && styles.checkboxActive]}>
                        {selected && <FontAwesome name="check" size={11} color="#fff" />}
                      </View>
                      {m.photoUrl ? (
                        <Image source={{ uri: m.photoUrl }} style={styles.memberAvatar} />
                      ) : (
                        <View style={styles.memberAvatarFallback}>
                          <Text style={styles.memberAvatarText}>{mi}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>{m.firstName} {m.lastName}</Text>
                        <Text style={styles.memberRole}>{m.membership?.role}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              style={[styles.createBtn, (creating || selectedMembers.length === 0) && { opacity: 0.5 }]}
              onPress={handleCreateChat}
              disabled={creating || selectedMembers.length === 0}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createBtnText}>Start Chat</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  scrollContent: { paddingBottom: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.light.background },
  loadingText: { marginTop: 12, fontSize: 14, color: Colors.light.textSecondary },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  pageTitle: { fontSize: 24, fontWeight: '700', color: Colors.light.text },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
  },
  newChatText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingVertical: 64 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.light.text, marginTop: 14 },
  emptySubtext: { fontSize: 13, color: Colors.light.textMuted, marginTop: 4 },

  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  chatRowUnread: { backgroundColor: '#eff6ff' },

  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.light.border },
  avatarTeam: { backgroundColor: Colors.light.tint },
  avatarDirect: { backgroundColor: '#6366f1' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  chatInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
  chatTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  chatName: { fontSize: 15, fontWeight: '500', color: Colors.light.text, flex: 1, marginRight: 8 },
  chatNameUnread: { fontWeight: '700', color: '#0f172a' },

  chatTime: { fontSize: 12, color: Colors.light.textMuted },
  chatTimeUnread: { color: Colors.light.tint, fontWeight: '600' },

  lastMsg: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 2 },
  lastMsgUnread: { color: '#334155', fontWeight: '600' },

  noMsg: { fontSize: 13, color: Colors.light.textMuted, fontStyle: 'italic', marginTop: 2 },

  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.light.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  nameInput: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Colors.light.text,
    backgroundColor: Colors.light.background,
    marginBottom: 14,
  },
  selectLabel: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary, marginBottom: 8 },
  noMembers: { fontSize: 14, color: Colors.light.textMuted, textAlign: 'center', marginVertical: 20 },
  membersList: { maxHeight: 250, marginBottom: 16 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.light.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.light.border },
  memberAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  memberName: { fontSize: 15, color: Colors.light.text, fontWeight: '500' },
  memberRole: { fontSize: 12, color: Colors.light.textMuted, textTransform: 'capitalize' },
  createBtn: {
    height: 46,
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
