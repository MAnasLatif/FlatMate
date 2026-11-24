import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, type Query, type QueryClient } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
} from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import SQLiteStorage from 'expo-sqlite/kv-store';

import { EncryptedStorage, type KeyValueStore } from './encrypted-storage';
import { CACHE_MAX_AGE_MS } from './query-client';

/**
 * The saved copy of the query cache, so data the user has loaded stays
 * readable offline and appears at once on the next launch (SRS section 7).
 * It is a copy of what the server said, never a source of truth: screens
 * still refetch it as soon as they can.
 */

/** Raise when saved data changes shape in a way the app version would not catch. */
const CACHE_FORMAT = 1;
/** Saving encrypts the whole cache, so changes are batched. */
const SAVE_INTERVAL_MS = 2000;
/** The most a slow restore holds the splash screen; the app then starts without it. */
const RESTORE_TIMEOUT_MS = 5000;
/**
 * Signed image links expire after an hour, so a saved one would be dead.
 * Expenses waiting to be sent have their own encrypted queue and are never
 * part of the copy of what the server said.
 */
const UNSAVED_QUERY_ROOTS = new Set(['signed-image-url', 'avatar-url', 'offline-queue']);

/** Each user's saved cache is a separate entry, so one person never sees another's. */
export function savedCacheKey(userId: string): string {
  return `flatmate-query-cache.${userId}`;
}

/** A saved cache with a different tag, from another app version or format, is discarded. */
export function cacheBuster(appVersion: string | undefined = Constants.expoConfig?.version) {
  return `${appVersion ?? 'unknown'}.${CACHE_FORMAT}`;
}

/** Only successful loads are saved, and never signed image links. */
export function shouldSaveQuery(query: Query): boolean {
  const root = query.queryKey[0];
  return (
    defaultShouldDehydrateQuery(query) &&
    !(typeof root === 'string' && UNSAVED_QUERY_ROOTS.has(root))
  );
}

/** The device store: encrypted, with its key in the keychain and the data in SQLite. */
function deviceStorage(): KeyValueStore {
  return new EncryptedStorage(SQLiteStorage, SecureStore);
}

/**
 * A store that refuses new writes once closed, and can wait for the writes
 * already under way. Saving is throttled and cannot be cancelled, so without
 * this a save scheduled before sign-out could write data back after the
 * saved cache was deleted.
 */
function closableStore(store: KeyValueStore) {
  let closed = false;
  const pending = new Set<Promise<void>>();
  return {
    getItem: (key: string) => store.getItem(key),
    removeItem: (key: string) => store.removeItem(key),
    setItem: async (key: string, value: string) => {
      if (closed) return;
      const write = store.setItem(key, value);
      pending.add(write);
      try {
        await write;
      } finally {
        pending.delete(write);
      }
    },
    close: async () => {
      closed = true;
      await Promise.allSettled([...pending]);
    },
  };
}

export type SavedCache = {
  /** Settles once the saved data is in the cache, or after a timeout. Never rejects. */
  restored: Promise<void>;
  /** Stops saving. Resolves once writes already under way have finished. */
  stop: () => Promise<void>;
};

/** Restores a user's saved cache into the query client, then keeps saving it. */
export function startSavedCache(
  queryClient: QueryClient,
  userId: string,
  storage: KeyValueStore = deviceStorage(),
): SavedCache {
  const store = closableStore(storage);
  const persister = createAsyncStoragePersister({
    storage: store,
    key: savedCacheKey(userId),
    throttleTime: SAVE_INTERVAL_MS,
  });
  const buster = cacheBuster();
  let stopped = false;
  let unsubscribe: (() => void) | undefined;

  const restore = persistQueryClientRestore({
    queryClient,
    persister,
    buster,
    maxAge: CACHE_MAX_AGE_MS,
  })
    .catch(() => {
      // An unreadable copy has already been removed by the library; the app
      // starts without it and loads everything from the server.
      console.warn('The saved data could not be restored and was discarded.');
    })
    .then(() => {
      // Saving starts only after restoring, so it never overwrites the saved
      // copy before it was read.
      if (stopped) return;
      unsubscribe = persistQueryClientSubscribe({
        queryClient,
        persister,
        buster,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldSaveQuery,
          shouldDehydrateMutation: () => false,
        },
      });
    });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, RESTORE_TIMEOUT_MS);
  });
  const restored = Promise.race([restore, timeout]).finally(() => clearTimeout(timer));

  return {
    restored,
    stop: () => {
      stopped = true;
      unsubscribe?.();
      return store.close();
    },
  };
}

/** Deletes a user's saved cache, such as at sign-out. */
export async function deleteSavedCache(
  userId: string,
  storage: KeyValueStore = deviceStorage(),
): Promise<void> {
  await storage.removeItem(savedCacheKey(userId));
}
