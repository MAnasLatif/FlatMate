import { useCallback, useEffect, useState } from 'react';

/** How long to wait before asking for another email code. Supabase limits resends too. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** "0:59", "1:00". */
export function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Seconds left before another code may be requested. It counts down to a
 * deadline rather than by steps, so it stays right after the app spends time
 * in the background. `startNow` starts it at once, for a screen opened right
 * after a code was sent.
 */
export function useResendCountdown(startNow: boolean) {
  const [deadline, setDeadline] = useState(() =>
    startNow ? Date.now() + RESEND_COOLDOWN_SECONDS * 1000 : 0,
  );
  const [now, setNow] = useState(() => Date.now());
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const isRunning = remaining > 0;

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  const restart = useCallback(() => {
    const started = Date.now();
    setNow(started);
    setDeadline(started + RESEND_COOLDOWN_SECONDS * 1000);
  }, []);

  return { remaining, restart };
}
