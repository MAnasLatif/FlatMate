import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { queryClient } from '@/lib/query-client';
import { deleteSavedCache, startSavedCache } from '@/lib/saved-cache';

import { SessionProvider, useSession } from '../session-provider';

type AuthHandler = (event: string, session: unknown) => void;
let mockAuthHandler: AuthHandler | undefined;
let mockStoredSession: unknown = null;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockStoredSession } }),
      onAuthStateChange: (handler: AuthHandler) => {
        mockAuthHandler = handler;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  },
}));

jest.mock('@/lib/saved-cache', () => ({
  startSavedCache: jest.fn(),
  deleteSavedCache: jest.fn(() => Promise.resolve()),
}));

const signedIn = { user: { id: 'user-1' } };

function State() {
  const { session, isLoading, isRestoring } = useSession();
  return (
    <Text>
      {isLoading ? 'loading' : session ? 'signed-in' : 'signed-out'}
      {isRestoring ? ' restoring' : ''}
    </Text>
  );
}

/** A saved cache whose restore finishes when the test says so. */
function controlledCache() {
  let finishRestore = () => undefined as void;
  const restored = new Promise<void>((resolve) => {
    finishRestore = resolve;
  });
  const order: string[] = [];
  const cache = {
    restored,
    stop: jest.fn(() => {
      order.push('stop');
      return Promise.resolve();
    }),
  };
  jest.mocked(startSavedCache).mockReturnValue(cache);
  return { cache, order, finishRestore: () => finishRestore() };
}

describe('SessionProvider and the saved cache', () => {
  beforeEach(() => {
    mockStoredSession = signedIn;
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('at launch, stays loading until the saved session data is back', async () => {
    const { finishRestore } = controlledCache();
    await render(
      <SessionProvider>
        <State />
      </SessionProvider>,
    );
    await waitFor(() => expect(startSavedCache).toHaveBeenCalledWith(queryClient, 'user-1'));
    // Loading, not just restoring: no navigator may render yet.
    expect(screen.getByText('loading restoring')).toBeTruthy();

    await act(async () => finishRestore());
    expect(screen.getByText('signed-in')).toBeTruthy();
  });

  it('after a sign-in, restores without loading, so open screens stay mounted', async () => {
    mockStoredSession = null;
    const { finishRestore } = controlledCache();
    await render(
      <SessionProvider>
        <State />
      </SessionProvider>,
    );
    expect(await screen.findByText('signed-out')).toBeTruthy();

    await act(async () => mockAuthHandler?.('SIGNED_IN', signedIn));
    expect(screen.getByText('signed-in restoring')).toBeTruthy();

    await act(async () => finishRestore());
    expect(screen.getByText('signed-in')).toBeTruthy();
  });

  it('starts nothing for a signed-out user', async () => {
    mockStoredSession = null;
    await render(
      <SessionProvider>
        <State />
      </SessionProvider>,
    );
    expect(await screen.findByText('signed-out')).toBeTruthy();
    expect(startSavedCache).not.toHaveBeenCalled();
  });

  it('at sign-out stops saving, clears the cache, then deletes the saved copy', async () => {
    const { cache, order, finishRestore } = controlledCache();
    jest.mocked(deleteSavedCache).mockImplementation(async () => {
      order.push('delete');
    });
    await render(
      <SessionProvider>
        <State />
      </SessionProvider>,
    );
    await act(async () => finishRestore());
    queryClient.setQueryData(['money', 'apartment-1', 'balances'], []);

    await act(async () => mockAuthHandler?.('SIGNED_OUT', null));

    expect(screen.getByText('signed-out')).toBeTruthy();
    expect(queryClient.getQueryData(['money', 'apartment-1', 'balances'])).toBeUndefined();
    expect(cache.stop).toHaveBeenCalled();
    expect(deleteSavedCache).toHaveBeenCalledWith('user-1');
    expect(order.slice(0, 2)).toEqual(['stop', 'delete']);
  });
});
