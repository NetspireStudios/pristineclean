import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Colors from '@/constants/Colors';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

function AuthGate() {
  const { isAuthenticated, isLoading, role, authRoute } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const firstSegment = segments[0] as string | undefined;
    const inAuthGroup = firstSegment === '(auth)';
    const inAdminGroup = firstSegment === '(admin)';
    const inStaffGroup = firstSegment === '(staff)';
    const inSharedScreen =
      firstSegment === 'booking-detail' ||
      firstSegment === 'create-booking' ||
      firstSegment === 'chat-room' ||
      firstSegment === 'admin-chat' ||
      firstSegment === 'edit-profile' ||
      firstSegment === 'business-settings' ||
      firstSegment === 'services' ||
      firstSegment === 'admin-settings' ||
      firstSegment === 'staff-settings' ||
      firstSegment === 'analytics' ||
      firstSegment === 'gallery' ||
      firstSegment === 'client-detail' ||
      firstSegment === 'verify-email' ||
      firstSegment === 'onboarding' ||
      firstSegment === 'waiting' ||
      firstSegment === 'accept-invite';

    if (!isAuthenticated && authRoute === 'login') {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
      return;
    }

    if (!isAuthenticated) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
      return;
    }

    // User is authenticated — route based on authRoute
    if (authRoute === 'verify-email') {
      if (firstSegment !== 'verify-email') {
        router.replace('/verify-email');
      }
      return;
    }

    if (authRoute === 'onboarding') {
      if (firstSegment !== 'onboarding') {
        router.replace('/onboarding');
      }
      return;
    }

    if (authRoute === 'waiting') {
      if (firstSegment !== 'waiting') {
        router.replace('/waiting');
      }
      return;
    }

    if (authRoute === 'accept-invite') {
      if (firstSegment !== 'accept-invite') {
        router.replace('/accept-invite');
      }
      return;
    }

    if (authRoute === 'dashboard') {
      if (inSharedScreen || inAdminGroup || inStaffGroup) return;

      if (role === 'owner' || role === 'admin') {
        router.replace('/(admin)/schedule');
      } else if (role === 'staff') {
        router.replace('/(staff)/schedule');
      }
      return;
    }

    // role-selector is handled inline on the login screen as a modal
    if (authRoute === 'role-selector') {
      return;
    }
  }, [isAuthenticated, isLoading, role, authRoute, segments]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)" options={{ headerShown: false }} />
      <Stack.Screen name="(staff)" options={{ headerShown: false }} />
      <Stack.Screen
        name="booking-detail"
        options={{ headerShown: true, presentation: 'card' }}
      />
      <Stack.Screen
        name="create-booking"
        options={{ headerShown: true, presentation: 'card' }}
      />
      <Stack.Screen
        name="admin-chat"
        options={{ headerShown: true, presentation: 'card' }}
      />
      <Stack.Screen
        name="chat-room"
        options={{ headerShown: true, presentation: 'card' }}
      />
      <Stack.Screen
        name="edit-profile"
        options={{ headerShown: true, presentation: 'card' }}
      />
      <Stack.Screen
        name="business-settings"
        options={{ headerShown: true, presentation: 'card' }}
      />
      <Stack.Screen
        name="services"
        options={{ headerShown: true, presentation: 'card' }}
      />
      <Stack.Screen
        name="admin-settings"
        options={{ headerShown: true, presentation: 'card' }}
      />
      <Stack.Screen
        name="staff-settings"
        options={{ headerShown: true, presentation: 'card' }}
      />
      <Stack.Screen
        name="analytics"
        options={{ headerShown: true, presentation: 'card' }}
      />
      <Stack.Screen
        name="gallery"
        options={{ headerShown: true, presentation: 'card' }}
      />
      <Stack.Screen
        name="client-detail"
        options={{ headerShown: true, presentation: 'card' }}
      />
      <Stack.Screen
        name="verify-email"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="onboarding"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="waiting"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="accept-invite"
        options={{ headerShown: false, gestureEnabled: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
  },
});
