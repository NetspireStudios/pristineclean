import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToMessages, sendMessage, deleteChat, markChatRead } from '@/services/chat';
import { getBusinessMembers } from '@/services/business';
import Colors from '@/constants/Colors';
import type { ChatMessage, BusinessMember } from '@/types';

export default function ChatRoomScreen() {
  const { chatId, chatName, chatType } = useLocalSearchParams<{
    chatId: string;
    chatName: string;
    chatType: string;
  }>();
  const { userDoc, businessId, role, firebaseUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const authUid = firebaseUser?.uid || '';
  const userDocId = userDoc?.id || '';
  const userName = userDoc
    ? `${userDoc.firstName} ${userDoc.lastName}`.trim()
    : 'User';

  const nameLookup = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => {
      const name = `${m.firstName} ${m.lastName}`.trim();
      if (m.id) map[m.id] = name;
      if (m.authUid) map[m.authUid] = name;
    });
    if (userDocId) map[userDocId] = userName;
    if (authUid) map[authUid] = userName;
    return map;
  }, [members, userDocId, authUid, userName]);

  useEffect(() => {
    if (businessId) {
      getBusinessMembers(businessId).then(setMembers).catch(() => {});
    }
  }, [businessId]);

  // Mark this chat as read when the user opens it
  useEffect(() => {
    if (chatId && authUid) {
      markChatRead(chatId, authUid);
    }
  }, [chatId, authUid]);

  useEffect(() => {
    if (!chatId) return;
    const unsub = subscribeToMessages(
      chatId,
      (msgs) => {
        setMessages([...msgs].reverse());
        setLoading(false);
        // Mark as read whenever new messages come in while the chat is open
        if (authUid) markChatRead(chatId, authUid);
      },
      (err) => {
        console.error('Messages error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [chatId, authUid]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !chatId || sending) return;

    setSending(true);
    setText('');
    try {
      await sendMessage(chatId, authUid, userName, trimmed, businessId || undefined);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send message.');
      setText(trimmed);
    } finally {
      setSending(false);
    }
  }

  function handleDelete() {
    if (!chatId || !businessId) return;
    Alert.alert('Delete Chat', 'This will permanently delete this chat and all messages.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteChat(chatId, businessId);
            router.back();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete chat.');
          }
        },
      },
    ]);
  }

  const isAdmin = role === 'owner' || role === 'admin';

  function resolveSenderName(item: ChatMessage): string {
    if (typeof item.senderName === 'string' && item.senderName !== 'User' && item.senderName.trim()) {
      return item.senderName;
    }
    if (item.senderId && nameLookup[item.senderId]) {
      return nameLookup[item.senderId];
    }
    return item.senderName || 'User';
  }

  function renderMessage({ item }: { item: ChatMessage }) {
    const isMe = item.senderId === authUid || item.senderId === userDocId;

    const rawText = item.text as any;
    const msgText =
      typeof rawText === 'string'
        ? rawText
        : rawText?.text
          ? String(rawText.text)
          : String(rawText || '');

    const senderLabel = resolveSenderName(item);

    let timeStr = '';
    const ts = (item as any).createdAt || (item as any).timestamp;
    if (ts) {
      let millis = 0;
      if (typeof ts === 'object' && 'seconds' in ts) {
        millis = ts.seconds * 1000;
      } else if (typeof ts === 'object' && ts.toMillis) {
        millis = ts.toMillis();
      } else if (typeof ts === 'number') {
        millis = ts > 1e12 ? ts : ts * 1000;
      }
      if (millis) {
        timeStr = new Date(millis).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }

    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        {!isMe && <Text style={styles.msgSender}>{senderLabel}</Text>}
        <View style={[styles.msgBubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{msgText}</Text>
        </View>
        {timeStr !== '' && <Text style={styles.msgTime}>{timeStr}</Text>}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Stack.Screen
        options={{
          title: chatName || 'Chat',
          headerTitleAlign: 'center',
          headerRight: () =>
            isAdmin ? (
              <Pressable
                onPress={handleDelete}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.deleteBtn}
              >
                <FontAwesome name="trash-o" size={20} color={Colors.light.danger} />
              </Pressable>
            ) : null,
        }}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FontAwesome name="comments-o" size={48} color={Colors.light.textMuted} />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubtext}>Send a message to start the conversation.</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messageList}
        />
      )}

      {/* Input Bar */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={Colors.light.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            (!text.trim() || sending) && styles.sendBtnDisabled,
            pressed && text.trim() && !sending && { opacity: 0.8 },
          ]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          <FontAwesome name="send" size={16} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, fontWeight: '600', color: Colors.light.text, marginTop: 14 },
  emptySubtext: { fontSize: 13, color: Colors.light.textMuted, marginTop: 4 },

  messageList: { padding: 16, paddingBottom: 8 },

  msgRow: { marginBottom: 12, alignItems: 'flex-start' },
  msgRowMe: { alignItems: 'flex-end' },
  msgSender: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginBottom: 2,
    marginLeft: 4,
  },
  msgBubble: {
    maxWidth: '80%',
    flexShrink: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleMe: {
    backgroundColor: Colors.light.tint,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: Colors.light.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  msgText: { fontSize: 15, lineHeight: 20, color: Colors.light.text },
  msgTextMe: { color: '#fff' },
  msgTime: { fontSize: 10, color: Colors.light.textMuted, marginTop: 3, marginHorizontal: 4 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.light.text,
    backgroundColor: Colors.light.background,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
  },
  sendBtnDisabled: { opacity: 0.4 },
  deleteBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
});
