import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '@/services/firebase';
import {
  signIn as authSignIn,
  signUp as authSignUp,
  signOutUser,
  resolveUserContext,
  requestPasswordReset as authResetPassword,
} from '@/services/auth';
import type { UserDoc, UserRole } from '@/types';

const SESSION_KEY = 'bp_session';

interface SessionData {
  userId: string;
  businessId: string;
  role: UserRole;
}

interface AuthState {
  firebaseUser: FirebaseUser | null;
  userDoc: UserDoc | null;
  businessId: string | null;
  role: UserRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) => Promise<{ uid: string }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  refreshUserContext: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    firebaseUser: null,
    userDoc: null,
    businessId: null,
    role: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Listen for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        await AsyncStorage.removeItem(SESSION_KEY);
        setState({
          firebaseUser: null,
          userDoc: null,
          businessId: null,
          role: null,
          isLoading: false,
          isAuthenticated: false,
        });
        return;
      }

      // User is authenticated, try to restore session or resolve fresh
      try {
        const cached = await AsyncStorage.getItem(SESSION_KEY);
        if (cached) {
          const session: SessionData = JSON.parse(cached);
          // Quick restore from cache, then refresh in background
          setState((prev) => ({
            ...prev,
            firebaseUser,
            businessId: session.businessId,
            role: session.role,
            isLoading: false,
            isAuthenticated: true,
          }));

          // Refresh full context in background
          resolveUserContext(firebaseUser.uid)
            .then((result) => {
              const newSession: SessionData = {
                userId: result.userId,
                businessId: result.businessId,
                role: result.role,
              };
              AsyncStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
              setState({
                firebaseUser,
                userDoc: result.userDoc,
                businessId: result.businessId,
                role: result.role,
                isLoading: false,
                isAuthenticated: true,
              });
            })
            .catch(() => {
              // Background refresh failed, keep cached data
            });
          return;
        }

        // No cache, resolve fresh
        const result = await resolveUserContext(firebaseUser.uid);
        const session: SessionData = {
          userId: result.userId,
          businessId: result.businessId,
          role: result.role,
        };
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));

        setState({
          firebaseUser,
          userDoc: result.userDoc,
          businessId: result.businessId,
          role: result.role,
          isLoading: false,
          isAuthenticated: true,
        });
      } catch (error) {
        // User is authenticated but has no business context
        // This happens for brand new users who haven't been invited yet
        setState({
          firebaseUser,
          userDoc: null,
          businessId: null,
          role: null,
          isLoading: false,
          isAuthenticated: false,
        });
      }
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    const result = await authSignIn(email, password);
    const session: SessionData = {
      userId: result.userId,
      businessId: result.businessId,
      role: result.role,
    };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));

    setState({
      firebaseUser: auth.currentUser,
      userDoc: result.userDoc,
      businessId: result.businessId,
      role: result.role,
      isLoading: false,
      isAuthenticated: true,
    });
  };

  const signUp = async (params: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) => {
    return authSignUp(params);
  };

  const signOut = async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    await signOutUser();
    setState({
      firebaseUser: null,
      userDoc: null,
      businessId: null,
      role: null,
      isLoading: false,
      isAuthenticated: false,
    });
  };

  const requestPasswordReset = async (email: string) => {
    await authResetPassword(email);
  };

  const refreshUserContext = async () => {
    if (!auth.currentUser) return;
    try {
      const result = await resolveUserContext(auth.currentUser.uid);
      const session: SessionData = {
        userId: result.userId,
        businessId: result.businessId,
        role: result.role,
      };
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setState({
        firebaseUser: auth.currentUser,
        userDoc: result.userDoc,
        businessId: result.businessId,
        role: result.role,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch {
      // Silently fail refresh
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
        refreshUserContext,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
