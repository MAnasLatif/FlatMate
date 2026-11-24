import * as SecureStore from 'expo-secure-store';
import SQLiteStorage from 'expo-sqlite/kv-store';

import { EncryptedStorage, type KeyValueStore } from './encrypted-storage';

/**
 * Writes saved on the phone while offline, waiting to be sent when the
 * connection returns (FR-10.7, decision 0018). They are kept apart from the
 * saved query cache: a queued write is something the server has not accepted
 * yet, never a copy of what it said. Each user's queue is one encrypted
 * entry, deleted at sign-out, and an entry older than 30 days is dropped
 * when the queue is next read.
 */

/** Raise when the stored shape changes; older entries are then dropped. */
const QUEUE_FORMAT = 1;
export const QUEUE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type QueuedEntry = {
  /** Also the request id it is sent with, so sending it twice does it once. */
  id: string;
  apartmentId: string;
  /** ISO time of the last save. */
  savedAt: string;
  /** The feature's own data, checked by the feature when it reads it. */
  value: unknown;
};

type StoredQueue = { format: number; entries: QueuedEntry[] };

export function queueKey(userId: string): string {
  return `flatmate-offline-queue.${userId}`;
}

function deviceStorage(): KeyValueStore {
  return new EncryptedStorage(SQLiteStorage, SecureStore);
}

/** Entries saved within the last 30 days. */
export function unexpired(entries: readonly QueuedEntry[], now: number): QueuedEntry[] {
  return entries.filter((entry) => {
    const saved = Date.parse(entry.savedAt);
    return Number.isFinite(saved) && now - saved < QUEUE_MAX_AGE_MS;
  });
}

function isQueuedEntry(value: unknown): value is QueuedEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.apartmentId === 'string' &&
    typeof entry.savedAt === 'string' &&
    'value' in entry
  );
}

function parse(raw: string | null): QueuedEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<StoredQueue>;
    if (parsed.format !== QUEUE_FORMAT || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter(isQueuedEntry);
  } catch {
    return [];
  }
}

/** Reads and changes run one at a time per user, so two changes cannot lose each other. */
const queues = new Map<string, Promise<unknown>>();

function serial<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(userId) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  queues.set(
    userId,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

/** The user's queue, oldest first, dropping entries older than 30 days for good. */
export function readQueue(
  userId: string,
  storage: KeyValueStore = deviceStorage(),
  now: number = Date.now(),
): Promise<QueuedEntry[]> {
  return serial(userId, async () => {
    const all = parse(await storage.getItem(queueKey(userId)));
    const kept = unexpired(all, now);
    if (kept.length !== all.length) await write(storage, userId, kept);
    return kept;
  });
}

/** Changes the user's queue in one step: `change` gets the entries and returns the new list. */
export function updateQueue(
  userId: string,
  change: (entries: QueuedEntry[]) => QueuedEntry[],
  storage: KeyValueStore = deviceStorage(),
  now: number = Date.now(),
): Promise<QueuedEntry[]> {
  return serial(userId, async () => {
    const current = unexpired(parse(await storage.getItem(queueKey(userId))), now);
    const next = change(current);
    await write(storage, userId, next);
    return next;
  });
}

/** Deletes a user's whole queue, as at sign-out. */
export function deleteQueue(
  userId: string,
  storage: KeyValueStore = deviceStorage(),
): Promise<void> {
  return serial(userId, () => storage.removeItem(queueKey(userId)));
}

async function write(
  storage: KeyValueStore,
  userId: string,
  entries: QueuedEntry[],
): Promise<void> {
  if (entries.length === 0) {
    await storage.removeItem(queueKey(userId));
    return;
  }
  const stored: StoredQueue = { format: QUEUE_FORMAT, entries };
  await storage.setItem(queueKey(userId), JSON.stringify(stored));
}
