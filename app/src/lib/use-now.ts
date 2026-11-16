import { useEffect, useState } from 'react';

/**
 * The current time in milliseconds, updated every `intervalMs`, for screens
 * that count down. The timer stops when the screen unmounts.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
