import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { queryClient } from '@/lib/query-client';
import { deleteSavedCache, type SavedCache, startSavedCache } from '@/lib/saved-cache';
import { supabase } from '@/lib/supabase';

type SessionContextValue = {
  session: Session | null;
  isLoading: boolean;
  /**
   * True while the signed-in user's saved data is being restored. The app
   * keeps the splash screen up and shows no signed-in screen until it is done,
   * so screens start from the saved data instead of from nothing.
   */
  isRestoring: boolean;
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
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  const savedCache = useRef<{ userId: string; cache: SavedCache } | null>(null);
  const userId = session?.user.id ?? null;

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
      if (event === 'SIGNED_OUT') {
        // Never show one person's data to the next. Saving stops before the
        // cache is cleared, and the saved copy is deleted once no write to it
        // is still under way.
        const ended = savedCache.current;
        savedCache.current = null;
        const stopped = ended?.cache.stop();
        queryClient.clear();
        if (ended && stopped) {
          void stopped
            .then(() => deleteSavedCache(ended.userId))
            .catch(() => console.warn('The saved data could not be deleted at sign-out.'));
        }
      }
      setSession(nextSession);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const cache = startSavedCache(queryClient, userId);
    savedCache.current = { userId, cache };
    let active = true;
    void cache.restored.then(() => {
      if (active) setRestoredFor(userId);
    });
    return () => {
      active = false;
      void cache.stop();
      if (savedCache.current?.cache === cache) savedCache.current = null;
    };
  }, [userId]);

  const isRestoring = userId !== null && restoredFor !== userId;

  const value = useMemo(
    () => ({ session, isLoading, isRestoring, isNavigationHeld, setNavigationHeld }),
    [session, isLoading, isRestoring, isNavigationHeld],
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
