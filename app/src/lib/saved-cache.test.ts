import { QueryClient } from '@tanstack/react-query';

import type { KeyValueStore } from './encrypted-storage';
import { CACHE_MAX_AGE_MS } from './query-client';
import { cacheBuster, deleteSavedCache, savedCacheKey, startSavedCache } from './saved-cache';

function memoryStore(): KeyValueStore & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => {
      items.set(key, value);
    },
    removeItem: async (key) => {
      items.delete(key);
    },
  };
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function savedQueryKeys(store: ReturnType<typeof memoryStore>, userId: string): unknown[] {
  const saved = store.items.get(savedCacheKey(userId));
  if (!saved) return [];
  const parsed = JSON.parse(saved) as { clientState: { queries: { queryKey: unknown }[] } };
  return parsed.clientState.queries.map((query) => query.queryKey);
}

/** Lets throttled saves run. */
async function flushSaves() {
  await jest.advanceTimersByTimeAsync(5000);
}

const balances = ['money', 'apartment-1', 'balances'];

describe('startSavedCache', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('restores what was saved for the same user', async () => {
    const store = memoryStore();
    const first = newClient();
    const saving = startSavedCache(first, 'user-1', store);
    await saving.restored;
    first.setQueryData(balances, [{ counterpartyId: 'b', finalMinor: 500 }]);
    await flushSaves();
    await saving.stop();

    const next = newClient();
    const restoring = startSavedCache(next, 'user-1', store);
    await restoring.restored;
    expect(next.getQueryData(balances)).toEqual([{ counterpartyId: 'b', finalMinor: 500 }]);
    await restoring.stop();
  });

  it("never restores one user's data for another", async () => {
    const store = memoryStore();
    const first = newClient();
    const saving = startSavedCache(first, 'user-1', store);
    await saving.restored;
    first.setQueryData(balances, [{ finalMinor: 500 }]);
    await flushSaves();
    await saving.stop();

    const other = newClient();
    const restoring = startSavedCache(other, 'user-2', store);
    await restoring.restored;
    expect(other.getQueryData(balances)).toBeUndefined();
    await restoring.stop();
  });

  it('saves neither failed loads nor signed image links', async () => {
    const store = memoryStore();
    const client = newClient();
    const saving = startSavedCache(client, 'user-1', store);
    await saving.restored;
    client.setQueryData(balances, []);
    client.setQueryData(['signed-image-url', 'receipts', 'a/b.jpg'], 'https://signed');
    client.setQueryData(['avatar-url', 'u/a.jpg'], 'https://signed');
    await client
      .fetchQuery({
        queryKey: ['money', 'apartment-1', 'broken'],
        queryFn: () => Promise.reject(new Error('x')),
      })
      .catch(() => undefined);
    await flushSaves();
    await saving.stop();

    expect(savedQueryKeys(store, 'user-1')).toEqual([balances]);
  });

  it('writes nothing after it is stopped', async () => {
    const store = memoryStore();
    const client = newClient();
    const saving = startSavedCache(client, 'user-1', store);
    await saving.restored;
    await saving.stop();
    client.setQueryData(balances, []);
    await flushSaves();
    expect(store.items.has(savedCacheKey('user-1'))).toBe(false);
  });

  it('discards a copy saved by another app version', async () => {
    const store = memoryStore();
    store.items.set(
      savedCacheKey('user-1'),
      JSON.stringify({
        timestamp: Date.now(),
        buster: 'an-older-version.0',
        clientState: { mutations: [], queries: [] },
      }),
    );
    const client = newClient();
    const restoring = startSavedCache(client, 'user-1', store);
    await restoring.restored;
    expect(store.items.has(savedCacheKey('user-1'))).toBe(false);
    await restoring.stop();
  });

  it('discards a copy older than the cache lifetime', async () => {
    const store = memoryStore();
    const saving = startSavedCache(newClient(), 'user-1', store);
    await saving.restored;
    await saving.stop();
    store.items.set(
      savedCacheKey('user-1'),
      JSON.stringify({
        timestamp: Date.now() - CACHE_MAX_AGE_MS - 1,
        buster: cacheBuster(),
        clientState: { mutations: [], queries: [] },
      }),
    );
    const restoring = startSavedCache(newClient(), 'user-1', store);
    await restoring.restored;
    expect(store.items.has(savedCacheKey('user-1'))).toBe(false);
    await restoring.stop();
  });

  it('stops waiting for a restore that hangs', async () => {
    const hanging: KeyValueStore = {
      getItem: () => new Promise<string | null>(() => undefined),
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };
    const restoring = startSavedCache(newClient(), 'user-1', hanging);
    let settled = false;
    void restoring.restored.then(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(5000);
    expect(settled).toBe(true);
    await restoring.stop();
  });
});

describe('deleteSavedCache', () => {
  it("removes only that user's saved copy", async () => {
    const store = memoryStore();
    store.items.set(savedCacheKey('user-1'), 'a');
    store.items.set(savedCacheKey('user-2'), 'b');
    await deleteSavedCache('user-1', store);
    expect(store.items.has(savedCacheKey('user-1'))).toBe(false);
    expect(store.items.has(savedCacheKey('user-2'))).toBe(true);
  });
});

describe('cacheBuster', () => {
  it('ties the saved copy to the app version and cache format', () => {
    expect(cacheBuster('0.1.0')).toBe('0.1.0.1');
    expect(cacheBuster(undefined)).toBe('unknown.1');
  });
});
