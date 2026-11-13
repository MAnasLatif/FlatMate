import type { Session } from '@supabase/supabase-js';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

type SessionContextValue = {
  session: Session | null;
  isLoading: boolean;
  /**
   * True while a flow that creates a session must finish before the app
   * switches to the signed-in screens, such as setting a new password after
   * a reset code has been accepted.
   */
  isNavigationHeld: boolean;
  setNavigationHeld: (held: boolean) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNavigationHeld, setNavigationHeld] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      // A stored session that can no longer be read means signed out.
      if (active) {
        setSession(data.session);
        setIsLoading(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'SIGNED_OUT') {
        // Never show one person's cached data to the next.
        queryClient.clear();
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({ session, isLoading, isNavigationHeld, setNavigationHeld }),
    [session, isLoading, isNavigationHeld],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider.');
  }
  return value;
}

/** The signed-in user's id. Only call this from screens behind the sign-in gate. */
export function useCurrentUserId(): string {
  const { session } = useSession();
  if (!session) {
    throw new Error('useCurrentUserId was called without a signed-in user.');
  }
  return session.user.id;
}
