"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { userByName } from "@/lib/mock/data";
import type { Role } from "@/lib/types";

const STORAGE_KEY = "hr-portal.session";

export interface Session {
  userId: string | null;
  name: string;
  activeRole: Role;
  signedInAt: string;
}

interface SessionContextValue {
  session: Session | null;
  /** True until the stored session has been read, so we do not flash the form. */
  loading: boolean;
  signIn: (name: string, role: Role) => void;
  signOut: () => void;
  /** Change the active role without signing out — a transfer mid-shift. */
  setActiveRole: (role: Role) => void;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  loading: true,
  signIn: () => {},
  signOut: () => {},
  setActiveRole: () => {},
});

/**
 * Who is signed in and what they are working as.
 *
 * People enter their name and pick their active role at sign-in, so the portal
 * can say who is doing which work rather than inferring it from a job title.
 * Someone who holds several roles — and several people here do — chooses which
 * one this session counts as, and can change it without signing out.
 *
 * This is a browser session only. Real authentication arrives with the Phase 1
 * backend, where identity comes from SSO and the active role is recorded
 * server-side against every action for the audit log. Nothing here is a
 * security control: it records intent, it does not verify identity.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSession(JSON.parse(raw) as Session);
    } catch {
      // Private browsing or blocked storage — the sign-in form is shown.
    }
    setLoading(false);
  }, []);

  const persist = useCallback((next: Session | null) => {
    setSession(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Non-fatal: the session simply does not survive a reload.
    }
  }, []);

  const signIn = useCallback(
    (name: string, role: Role) => {
      const trimmed = name.trim();
      // A name that matches a set-up user links the session to their record;
      // one that does not still signs in, and shows as unrecognised.
      const known = userByName(trimmed);
      persist({
        userId: known?.id ?? null,
        name: trimmed,
        activeRole: role,
        signedInAt: new Date().toISOString(),
      });
    },
    [persist],
  );

  const signOut = useCallback(() => persist(null), [persist]);

  const setActiveRole = useCallback(
    (role: Role) => {
      if (!session) return;
      persist({ ...session, activeRole: role });
    },
    [persist, session],
  );

  const value = useMemo(
    () => ({ session, loading, signIn, signOut, setActiveRole }),
    [session, loading, signIn, signOut, setActiveRole],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
