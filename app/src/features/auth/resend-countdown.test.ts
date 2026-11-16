import { act, renderHook } from '@testing-library/react-native';

import { formatCountdown, useResendCountdown } from './resend-countdown';

describe('formatCountdown', () => {
  it('shows minutes and two-digit seconds', () => {
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(59)).toBe('0:59');
    expect(formatCountdown(5)).toBe('0:05');
  });
});

describe('useResendCountdown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('starts at once for a screen opened right after a code was sent, and counts down', async () => {
    const { result } = await renderHook(() => useResendCountdown(true));
    expect(result.current.remaining).toBe(60);

    await act(async () => jest.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(59);

    await act(async () => jest.advanceTimersByTime(59_000));
    expect(result.current.remaining).toBe(0);
  });

  it('stays at zero when no code was just sent, until restarted', async () => {
    const { result } = await renderHook(() => useResendCountdown(false));
    expect(result.current.remaining).toBe(0);

    await act(async () => result.current.restart());
    expect(result.current.remaining).toBe(60);
  });

  it('keeps time while the app is away, as it counts to a deadline', async () => {
    const { result } = await renderHook(() => useResendCountdown(true));
    // The interval may not run while backgrounded; the clock still moves.
    await act(async () => {
      jest.setSystemTime(Date.now() + 45_000);
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toBe(14);
  });
});
