"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  cloudflareLogout,
  cloudflareMe,
  type CloudflareAuthAccount,
  type CloudflareAuthProfile,
  type CloudflareAuthUser,
} from "@/lib/cloudflare/auth-client";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import {
  canEditSettings as canEditSettingsFor,
  canManageMembers as canManageMembersFor,
  canSendMessages as canSendMessagesFor,
  type AccountRole,
} from "@/lib/auth/roles";

interface CloudflareAuthContextValue {
  user: CloudflareAuthUser | null;
  profile: CloudflareAuthProfile | null;
  account: CloudflareAuthAccount | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  accountId: string | null;
  accountRole: AccountRole | null;
  defaultCurrency: string;
  isOwner: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isViewer: boolean;
  canManageMembers: boolean;
  canEditSettings: boolean;
  canSendMessages: boolean;
}

const CloudflareAuthContext =
  createContext<CloudflareAuthContextValue | null>(null);

export function CloudflareAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CloudflareAuthUser | null>(null);
  const [profile, setProfile] = useState<CloudflareAuthProfile | null>(null);
  const [account, setAccount] = useState<CloudflareAuthAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const session = await cloudflareMe();
    setUser(session?.user ?? null);
    setProfile(session?.profile ?? null);
    setAccount(session?.account ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;
    cloudflareMe()
      .then((session) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
        setProfile(session?.profile ?? null);
        setAccount(session?.account ?? null);
      })
      .catch((err) => {
        console.error("[CloudflareAuthProvider] session load failed:", err);
        if (!mounted) return;
        setUser(null);
        setProfile(null);
        setAccount(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    await cloudflareLogout();
    setUser(null);
    setProfile(null);
    setAccount(null);
    window.location.href = "/login";
  }, []);

  const derived = useMemo(() => {
    const role = profile?.accountRole ?? null;
    return {
      accountRole: role,
      accountId: profile?.accountId ?? null,
      isOwner: role === "owner",
      isAdmin: role === "admin",
      isAgent: role === "agent",
      isViewer: role === "viewer",
      canManageMembers: role ? canManageMembersFor(role) : false,
      canEditSettings: role ? canEditSettingsFor(role) : false,
      canSendMessages: role ? canSendMessagesFor(role) : false,
    };
  }, [profile?.accountId, profile?.accountRole]);

  return (
    <CloudflareAuthContext.Provider
      value={{
        user,
        profile,
        account,
        loading,
        profileLoading: loading,
        signOut,
        refreshProfile,
        defaultCurrency: account?.defaultCurrency ?? DEFAULT_CURRENCY,
        ...derived,
      }}
    >
      {children}
    </CloudflareAuthContext.Provider>
  );
}

export function useCloudflareAuth(): CloudflareAuthContextValue {
  const ctx = useContext(CloudflareAuthContext);
  if (!ctx) {
    return {
      user: null,
      profile: null,
      account: null,
      loading: false,
      profileLoading: false,
      signOut: async () => {
        window.location.href = "/login";
      },
      refreshProfile: async () => {},
      accountId: null,
      accountRole: null,
      defaultCurrency: DEFAULT_CURRENCY,
      isOwner: false,
      isAdmin: false,
      isAgent: false,
      isViewer: false,
      canManageMembers: false,
      canEditSettings: false,
      canSendMessages: false,
    };
  }
  return ctx;
}
