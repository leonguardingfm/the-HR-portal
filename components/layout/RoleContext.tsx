"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Role } from "@/lib/types";

const STORAGE_KEY = "hr-portal.demo-role";

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue>({
  role: "recruitment_manager",
  setRole: () => {},
});

/**
 * Holds the active role for the demonstration build.
 *
 * In production the role comes from the signed-in user via SSO and is enforced
 * server-side in the API layer — never from client state. The switcher exists
 * so the role-aware navigation and dashboard can be reviewed without seven
 * separate logins.
 */
export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>("recruitment_manager");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Role | null;
      if (stored) setRoleState(stored);
    } catch {
      // Private browsing or blocked storage — the default role is fine.
    }
  }, []);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice simply does not persist.
    }
  }, []);

  return (
    <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
