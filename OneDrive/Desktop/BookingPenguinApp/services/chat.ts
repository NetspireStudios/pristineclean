import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  increment,
  Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import type { ChatDoc, ChatMessage, ChatParticipantDetail } from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function sortTimestamp(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts?.seconds) return ts.seconds;
  if (ts?.toMillis) return ts.toMillis() / 1000;
  return 0;
}

/**
 * Returns the unread message count for a user in a specific chat.
 */
export function getChatUnreadCount(chat: ChatDoc, authUid: string): number {
  return chat.unreadCounts?.[authUid] || 0;
}

// ── Subscriptions ────────────────────────────────────────────────────────────

export function subscribeToChats(
  businessId: string,
  userId: string,
  onData: (chats: ChatDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'chats'),
    where('businessId', '==', businessId),
    where('participants', 'array-contains', userId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const chats = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }) as ChatDoc)
        .sort((a, b) => sortTimestamp(b.lastMessageAt) - sortTimestamp(a.lastMessageAt));
      onData(chats);
    },
    (error) => {
      console.error('[Chat] Subscription error:', error);
      onError?.(error);
    }
  );
}

export function subscribeToMessages(
  chatId: string,
  onData: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const messagesRef = collection(db, 'chats', chatId, 'messages');

  return onSnapshot(
    messagesRef,
    (snapshot) => {
      const messages = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }) as ChatMessage)
        .sort((a, b) => {
          const aTs = (a as any).createdAt || (a as any).timestamp;
          const bTs = (b as any).createdAt || (b as any).timestamp;
          return sortTimestamp(aTs) - sortTimestamp(bTs);
        });
      onData(messages);
    },
    (error) => {
      console.error('[Chat] Messages error:', error);
      onError?.(error);
    }
  );
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function sendMessage(
  chatId: string,
  senderId: string,
  senderName: string,
  text: string,
  businessId?: string
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const now = serverTimestamp();

  await addDoc(collection(db, 'chats', chatId, 'messages'), {
    senderId,
    senderName,
    text: trimmed,
    createdAt: now,
    timestamp: now,
  });

  // Build the update payload: lastMessage + increment unreadCounts for others
  const chatSnap = await getDoc(doc(db, 'chats', chatId));
  const chatData = chatSnap.exists() ? chatSnap.data() : null;
  const participants: string[] = chatData?.participants || [];
  const isTeamChat = chatData?.type === 'team';

  const updateData: Record<string, any> = {
    'lastMessage.text': trimmed.substring(0, 200),
    'lastMessage.senderId': senderId,
    'lastMessage.timestamp': now,
    'lastMessage.deleted': false,
    lastMessageAt: now,
  };

  if (isTeamChat) {
    updateData['lastMessage.senderName'] = senderName;
  }

  // Increment unreadCounts for every participant except the sender
  participants.forEach((pid) => {
    if (pid !== senderId) {
      updateData[`unreadCounts.${pid}`] = increment(1);
    }
  });

  await updateDoc(doc(db, 'chats', chatId), updateData);

  if (businessId) {
    notifyParticipants(chatId, senderId, senderName, trimmed, businessId).catch(() => {});
  }
}

/**
 * Reset unread count for this user to 0 (mark chat as read).
 */
export async function markChatRead(chatId: string, userId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      [`unreadCounts.${userId}`]: 0,
    });
  } catch {
    // Best-effort
  }
}

export async function createChat(params: {
  businessId: string;
  type: 'team' | 'direct';
  name?: string;
  participants: string[];
  participantDetails: Record<string, ChatParticipantDetail>;
}): Promise<string> {
  const unreadCounts: Record<string, number> = {};
  params.participants.forEach((pid) => {
    unreadCounts[pid] = 0;
  });

  const chatData: Record<string, any> = {
    businessId: params.businessId,
    participants: params.participants,
    participantDetails: params.participantDetails,
    lastMessage: {
      text: '',
      senderId: null,
      timestamp: serverTimestamp(),
      deleted: false,
    },
    unreadCounts,
    createdAt: serverTimestamp(),
  };

  if (params.type === 'team') {
    chatData.type = 'team';
    chatData.name = params.name || 'Team Chat';
    chatData.createdBy = params.participants[0];
    chatData.admins = [params.participants[0]];
    chatData['lastMessage.senderName'] = '';
  } else if (params.name) {
    chatData.name = params.name;
  }

  const ref = await addDoc(collection(db, 'chats'), chatData);
  return ref.id;
}

export async function deleteChat(chatId: string, businessId: string): Promise<void> {
  const fn = httpsCallable(functions, 'deleteChatSecure');
  await fn({ chatId, businessId });
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function notifyParticipants(
  chatId: string,
  senderId: string,
  senderName: string,
  text: string,
  businessId: string
): Promise<void> {
  try {
    const chatSnap = await getDoc(doc(db, 'chats', chatId));
    if (!chatSnap.exists()) return;

    const chatData = chatSnap.data();
    const participants: string[] = chatData.participants || [];
    const others = participants.filter((id) => id !== senderId);
    if (others.length === 0) return;

    const createNotification = httpsCallable(functions, 'createNotificationSecure');
    const preview = text.length > 80 ? text.substring(0, 80) + '...' : text;

    await Promise.allSettled(
      others.map((recipientId) =>
        createNotification({
          userId: recipientId,
          title: `Message from ${senderName}`,
          message: preview,
          type: 'chat_message',
          businessId,
        })
      )
    );
  } catch {
    // Best-effort
  }
}
