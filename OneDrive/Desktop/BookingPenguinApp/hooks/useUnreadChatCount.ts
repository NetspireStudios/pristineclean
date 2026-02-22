import { useState, useEffect } from 'react';
import { subscribeToChats, getChatUnreadCount } from '@/services/chat';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Real-time total unread message count across all chats for the current user.
 * Driven by `unreadCounts.{authUid}` on each chat document via onSnapshot.
 */
export function useUnreadChatCount(): number {
  const { firebaseUser, businessId } = useAuth();
  const [count, setCount] = useState(0);

  const authUid = firebaseUser?.uid || '';

  useEffect(() => {
    if (!businessId || !authUid) return;

    const unsub = subscribeToChats(
      businessId,
      authUid,
      (chats) => {
        let total = 0;
        for (const chat of chats) {
          total += getChatUnreadCount(chat, authUid);
        }
        setCount(total);
      },
      () => {}
    );

    return unsub;
  }, [businessId, authUid]);

  return count;
}
