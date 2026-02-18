import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '@/services/firebase';
import {
  signIn as authSignIn,
  signUp as authSignUp,
  signOutUser,
  resolveUserContext,
  requestPasswordReset as authResetPassword,
  findUserByEmail,
  handlePostLogin as authHandlePostLogin,
  loginWithGoogle as authLoginWithGoogle,
  linkGoogleToAccount as authLinkGoogle,
  saveContext,
  getContext,
  clearContext,
  type PostLoginResult,
  type GoogleLoginResult,
} from '@/services/auth';
import type { UserDoc, UserRole, Membership } from '@/types';

const SESSION_KEY = 'bp_session';

type AuthRoute =
  | 'loading'
  | 'login'
  | 'verify-email'
  | 'onboarding'
  | 'waiting'
  | 'accept-invite'
  | 'role-selector'
  | 'dashboard';

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
  customUserId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authRoute: AuthRoute;
  pendingMemberships: Membership[] | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<PostLoginResult>;
  signUp: (params: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) => Promise<{ uid: string; customUserId: string; redirect: string }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<GoogleLoginResult>;
  linkGoogleToAccount: (
    email: string,
    password: string,
    customUserId: string,
    pendingCredential: any,
    linkMode: string,
  ) => Promise<PostLoginResult>;
  refreshUserContext: () => Promise<void>;
  selectMembership: (membership: Membership) => Promise<void>;
  setAuthRoute: (route: AuthRoute) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    firebaseUser: null,
    userDoc: null,
    businessId: null,
    role: null,
    customUserId: null,
    isLoading: true,
    isAuthenticated: false,
    authRoute: 'loading',
    pendingMemberships: null,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        await clearContext();
        setState({
          firebaseUser: null,
          userDoc: null,
          businessId: null,
          role: null,
          customUserId: null,
          isLoading: false,
          isAuthenticated: false,
          authRoute: 'login',
          pendingMemberships: null,
        });
        return;
      }

      try {
        const cached = await AsyncStorage.getItem(SESSION_KEY);
        if (cached) {
          const session: SessionData = JSON.parse(cached);
          setState((prev) => ({
            ...prev,
            firebaseUser,
            businessId: session.businessId,
            role: session.role,
            customUserId: session.userId,
            isLoading: false,
            isAuthenticated: true,
            authRoute: 'dashboard',
          }));

          resolveUserContext(firebaseUser.uid)
            .then((result) => {
              const newSession: SessionData = {
                userId: result.userId,
                businessId: result.businessId,
                role: result.role,
              };
              AsyncStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
              setState((prev) => ({
                ...prev,
                firebaseUser,
                userDoc: result.userDoc,
                businessId: result.businessId,
                role: result.role,
                customUserId: result.userId,
                isLoading: false,
                isAuthenticated: true,
                authRoute: 'dashboard',
              }));
            })
            .catch(() => { });
          return;
        }

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
          customUserId: result.userId,
          isLoading: false,
          isAuthenticated: true,
          authRoute: 'dashboard',
          pendingMemberships: null,
        });
      } catch (error: any) {
        const msg = error?.message || '';

        if (msg === 'NO_ACTIVE_MEMBERSHIP') {
          setState({
            firebaseUser,
            userDoc: null,
            businessId: null,
            role: null,
            customUserId: null,
            isLoading: false,
            isAuthenticated: true,
            authRoute: 'waiting',
            pendingMemberships: null,
          });
          return;
        }

        // New user / no business map — check Firestore for profile state
        const email = firebaseUser.email?.toLowerCase();
        if (email) {
          try {
            const fsUser = await findUserByEmail(email);
            if (fsUser.exists) {
              const memberships = fsUser.userData?.memberships || [];
              const postLogin = authHandlePostLogin(memberships, fsUser.userData, fsUser.userId!);

              if (postLogin.redirect === 'verify-email') {
                setState({
                  firebaseUser,
                  userDoc: null,
                  businessId: null,
                  role: null,
                  customUserId: fsUser.userId,
                  isLoading: false,
                  isAuthenticated: true,
                  authRoute: 'verify-email',
                  pendingMemberships: null,
                });
                return;
              }
              if (postLogin.redirect === 'onboarding') {
                setState({
                  firebaseUser,
                  userDoc: null,
                  businessId: null,
                  role: null,
                  customUserId: fsUser.userId,
                  isLoading: false,
                  isAuthenticated: true,
                  authRoute: 'onboarding',
                  pendingMemberships: null,
                });
                return;
              }
              if (postLogin.redirect === 'waiting') {
                setState({
                  firebaseUser,
                  userDoc: null,
                  businessId: null,
                  role: null,
                  customUserId: fsUser.userId,
                  isLoading: false,
                  isAuthenticated: true,
                  authRoute: 'waiting',
                  pendingMemberships: null,
                });
                return;
              }
            }
          } catch { }
        }

        // Check for pending invitation
        const pendingInviteId = await AsyncStorage.getItem('pendingInvitationId');
        if (pendingInviteId) {
          setState({
            firebaseUser,
            userDoc: null,
            businessId: null,
            role: null,
            customUserId: null,
            isLoading: false,
            isAuthenticated: true,
            authRoute: 'accept-invite',
            pendingMemberships: null,
          });
          return;
        }

        setState({
          firebaseUser,
          userDoc: null,
          businessId: null,
          role: null,
          customUserId: null,
          isLoading: false,
          isAuthenticated: true,
          authRoute: 'onboarding',
          pendingMemberships: null,
        });
      }
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string): Promise<PostLoginResult> => {
    const result = await authSignIn(email, password);

    if (result.redirect === 'verify-email') {
      setState((prev) => ({ ...prev, authRoute: 'verify-email', customUserId: result.customUserId || null, isAuthenticated: true }));
      return result;
    }
    if (result.redirect === 'onboarding') {
      setState((prev) => ({ ...prev, authRoute: 'onboarding', customUserId: result.customUserId || null, isAuthenticated: true }));
      return result;
    }
    if (result.redirect === 'waiting') {
      setState((prev) => ({ ...prev, authRoute: 'waiting', customUserId: result.customUserId || null, isAuthenticated: true }));
      return result;
    }
    if (result.showRoleSelector) {
      setState((prev) => ({
        ...prev,
        authRoute: 'role-selector',
        pendingMemberships: result.memberships || null,
        customUserId: result.customUserId || null,
        isAuthenticated: true,
      }));
      return result;
    }

    // Single active membership
    const context = await getContext();
    if (context) {
      const session: SessionData = {
        userId: context.customUserId,
        businessId: context.businessId,
        role: context.role,
      };
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setState({
        firebaseUser: auth.currentUser,
        userDoc: result.profile || null,
        businessId: context.businessId,
        role: context.role,
        customUserId: context.customUserId,
        isLoading: false,
        isAuthenticated: true,
        authRoute: 'dashboard',
        pendingMemberships: null,
      });
    }

    return result;
  };

  const signUp = async (params: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) => {
    const result = await authSignUp(params);
    setState((prev) => ({
      ...prev,
      customUserId: result.customUserId,
      isAuthenticated: true,
      authRoute: 'verify-email',
    }));
    return result;
  };

  const signOut = async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    await signOutUser();
    setState({
      firebaseUser: null,
      userDoc: null,
      businessId: null,
      role: null,
      customUserId: null,
      isLoading: false,
      isAuthenticated: false,
      authRoute: 'login',
      pendingMemberships: null,
    });
  };

  const requestPasswordReset = async (email: string) => {
    await authResetPassword(email);
  };

  const loginWithGoogle = async (idToken: string): Promise<GoogleLoginResult> => {
    const result = await authLoginWithGoogle(idToken);

    if (!result.success) return result;

    if (result.redirect === 'verify-email') {
      setState((prev) => ({ ...prev, authRoute: 'verify-email', customUserId: result.customUserId || null, isAuthenticated: true }));
    } else if (result.redirect === 'onboarding') {
      setState((prev) => ({ ...prev, authRoute: 'onboarding', customUserId: result.customUserId || null, isAuthenticated: true }));
    } else if (result.redirect === 'waiting') {
      setState((prev) => ({ ...prev, authRoute: 'waiting', customUserId: result.customUserId || null, isAuthenticated: true }));
    } else if (result.redirect === 'accept-invite') {
      setState((prev) => ({ ...prev, authRoute: 'accept-invite', customUserId: result.customUserId || null, isAuthenticated: true }));
    } else if (result.showRoleSelector) {
      setState((prev) => ({
        ...prev,
        authRoute: 'role-selector',
        pendingMemberships: result.memberships || null,
        customUserId: result.customUserId || null,
        isAuthenticated: true,
      }));
    } else {
      const context = await getContext();
      if (context) {
        const session: SessionData = {
          userId: context.customUserId,
          businessId: context.businessId,
          role: context.role,
        };
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
        setState({
          firebaseUser: auth.currentUser,
          userDoc: result.profile || null,
          businessId: context.businessId,
          role: context.role,
          customUserId: context.customUserId,
          isLoading: false,
          isAuthenticated: true,
          authRoute: 'dashboard',
          pendingMemberships: null,
        });
      }
    }

    return result;
  };

  const linkGoogleToAccountCtx = async (
    email: string,
    password: string,
    customUserId: string,
    pendingCredential: any,
    linkMode: string,
  ): Promise<PostLoginResult> => {
    const result = await authLinkGoogle(email, password, customUserId, pendingCredential, linkMode);

    const context = await getContext();
    if (context) {
      const session: SessionData = {
        userId: context.customUserId,
        businessId: context.businessId,
        role: context.role,
      };
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setState({
        firebaseUser: auth.currentUser,
        userDoc: result.profile || null,
        businessId: context.businessId,
        role: context.role,
        customUserId: context.customUserId,
        isLoading: false,
        isAuthenticated: true,
        authRoute: 'dashboard',
        pendingMemberships: null,
      });
    }

    return result;
  };

  const selectMembership = async (membership: Membership) => {
    const customUserId = state.customUserId || (await AsyncStorage.getItem('bp_customUserId')) || '';
    await saveContext({ ...membership, customUserId });
    const session: SessionData = {
      userId: customUserId,
      businessId: membership.businessId,
      role: membership.role,
    };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));

    setState({
      firebaseUser: auth.currentUser,
      userDoc: state.userDoc,
      businessId: membership.businessId,
      role: membership.role,
      customUserId,
      isLoading: false,
      isAuthenticated: true,
      authRoute: 'dashboard',
      pendingMemberships: null,
    });
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
        customUserId: result.userId,
        isLoading: false,
        isAuthenticated: true,
        authRoute: 'dashboard',
        pendingMemberships: null,
      });
    } catch { }
  };

  const setAuthRoute = useCallback((route: AuthRoute) => {
    setState((prev) => ({ ...prev, authRoute: route }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
        loginWithGoogle,
        linkGoogleToAccount: linkGoogleToAccountCtx,
        refreshUserContext,
        selectMembership,
        setAuthRoute,
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
