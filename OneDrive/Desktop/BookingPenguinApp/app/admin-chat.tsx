import React from 'react';
import { Stack } from 'expo-router';
import ChatList from '@/components/ChatList';
import Colors from '@/constants/Colors';

export default function AdminChatScreen() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Chat',
          headerStyle: { backgroundColor: Colors.light.surface },
          headerTintColor: Colors.light.text,
        }}
      />
      <ChatList />
    </>
  );
}
