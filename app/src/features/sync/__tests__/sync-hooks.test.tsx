import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { fetchMembers, type Member } from '@/features/apartments/api';
import { subscribeToTopic, type TopicHandlers } from '@/lib/realtime-topic';

import { useApartmentChanges, useUserChanges } from '../hooks';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn() }));
jest.mock('@/lib/realtime-topic', () => ({ subscribeToTopic: jest.fn() }));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchMembers: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));

const ME = '11111111-1111-1111-1111-111111111111';
const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const subscriptions = new Map<string, { handlers: TopicHandlers; stop: jest.Mock }>();
jest.mocked(subscribeToTopic).mockImplementation((topic, handlers) => {
  const stop = jest.fn(() => subscriptions.delete(topic));
  subscriptions.set(topic, { handlers, stop });
  return stop;
});

function member(leftAt: string | null): Member {
  return {
    membershipId: 'm-1',
    userId: ME,
    role: 'member',
    canAddExpense: true,
    joinedAt: '2026-11-01T00:00:00Z',
    leftAt,
    leftReason: leftAt ? 'removed' : null,
    displayName: 'Anas',
    avatarPath: null,
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const isStale = (key: readonly unknown[]) =>
    queryClient.getQueryState(key)?.isInvalidated ?? false;
  return { queryClient, wrapper, isStale };
}

beforeEach(() => {
  subscriptions.clear();
  jest.mocked(fetchMembers).mockResolvedValue([member(null)]);
});

describe('useUserChanges', () => {
  it('listens on the user topic and refreshes only what changed', async () => {
    const { queryClient, wrapper, isStale } = setup();
    queryClient.setQueryData(['profile', ME], { displayName: 'Anas' });
    queryClient.setQueryData(['accounts', 'mine', ME], []);
    await renderHook(() => useUserChanges(ME), { wrapper });

    const topic = subscriptions.get(`user:${ME}`);
    expect(topic).toBeDefined();
    await act(async () => topic?.handlers.onChange('profile'));

    expect(isStale(['profile', ME])).toBe(true);
    expect(isStale(['accounts', 'mine', ME])).toBe(false);
  });
});

describe('useApartmentChanges', () => {
  it('listens on the apartment topic and refreshes money on a financial change', async () => {
    const { queryClient, wrapper, isStale } = setup();
    queryClient.setQueryData(['money', APARTMENT, 'balances'], []);
    queryClient.setQueryData(['apartments', APARTMENT, 'categories'], []);
    await renderHook(() => useApartmentChanges(APARTMENT), { wrapper });
    await waitFor(() => expect(subscriptions.has(`apartment:${APARTMENT}`)).toBe(true));

    await act(async () =>
      subscriptions.get(`apartment:${APARTMENT}`)?.handlers.onChange('expense'),
    );

    expect(isStale(['money', APARTMENT, 'balances'])).toBe(true);
    expect(isStale(['apartments', APARTMENT, 'categories'])).toBe(false);
  });

  it('on catching up, refreshes only data loaded before it may have missed events', async () => {
    const { queryClient, wrapper, isStale } = setup();
    await renderHook(() => useApartmentChanges(APARTMENT), { wrapper });
    await waitFor(() => expect(subscriptions.has(`apartment:${APARTMENT}`)).toBe(true));
    queryClient.setQueryData(['money', APARTMENT, 'old'], [], { updatedAt: 1000 });
    queryClient.setQueryData(['money', APARTMENT, 'new'], [], { updatedAt: 3000 });

    await act(async () => subscriptions.get(`apartment:${APARTMENT}`)?.handlers.onCatchUp(2000));

    expect(isStale(['money', APARTMENT, 'old'])).toBe(true);
    expect(isStale(['money', APARTMENT, 'new'])).toBe(false);
  });

  it('stops listening and drops unshown money data when the membership ends', async () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(['money', APARTMENT, 'expense', 'e-1'], { title: 'Rent' });
    jest.mocked(fetchMembers).mockResolvedValue([member('2026-11-14T00:00:00Z')]);
    await renderHook(() => useApartmentChanges(APARTMENT), { wrapper });

    await waitFor(() =>
      expect(queryClient.getQueryData(['money', APARTMENT, 'expense', 'e-1'])).toBeUndefined(),
    );
    expect(subscriptions.has(`apartment:${APARTMENT}`)).toBe(false);
  });
});
