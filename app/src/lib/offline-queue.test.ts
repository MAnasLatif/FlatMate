import type { KeyValueStore } from './encrypted-storage';
import {
  QUEUE_MAX_AGE_MS,
  deleteQueue,
  queueKey,
  readQueue,
  type QueuedEntry,
  updateQueue,
} from './offline-queue';

jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-sqlite/kv-store', () => ({}));

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

const NOW = Date.parse('2026-11-24T12:00:00Z');

function entry(id: string, savedAt: number, apartmentId = 'flat'): QueuedEntry {
  return { id, apartmentId, savedAt: new Date(savedAt).toISOString(), value: { title: id } };
}

describe('offline queue storage', () => {
  it('keeps each user’s queue apart', async () => {
    const store = memoryStore();
    await updateQueue('anas', () => [entry('a', NOW)], store, NOW);
    await updateQueue('zubair', () => [entry('z', NOW)], store, NOW);
    expect((await readQueue('anas', store, NOW)).map((item) => item.id)).toEqual(['a']);
    expect((await readQueue('zubair', store, NOW)).map((item) => item.id)).toEqual(['z']);
  });

  it('drops entries older than 30 days for good', async () => {
    const store = memoryStore();
    await updateQueue(
      'anas',
      () => [entry('old', NOW - QUEUE_MAX_AGE_MS - 1), entry('new', NOW - 1000)],
      store,
      NOW - 2000,
    );
    expect((await readQueue('anas', store, NOW)).map((item) => item.id)).toEqual(['new']);
    expect(store.items.get(queueKey('anas'))).not.toContain('"old"');
  });

  it('does not lose an entry when two changes happen at once', async () => {
    const store = memoryStore();
    await Promise.all([
      updateQueue('anas', (entries) => [...entries, entry('one', NOW)], store, NOW),
      updateQueue('anas', (entries) => [...entries, entry('two', NOW)], store, NOW),
    ]);
    expect((await readQueue('anas', store, NOW)).map((item) => item.id)).toEqual(['one', 'two']);
  });

  it('reads an unreadable or older format as an empty queue', async () => {
    const store = memoryStore();
    store.items.set(queueKey('anas'), 'not json');
    expect(await readQueue('anas', store, NOW)).toEqual([]);
    store.items.set(queueKey('anas'), JSON.stringify({ format: 0, entries: [entry('a', NOW)] }));
    expect(await readQueue('anas', store, NOW)).toEqual([]);
  });

  it('removes the entry when the last entry goes, and at sign-out', async () => {
    const store = memoryStore();
    await updateQueue('anas', () => [entry('a', NOW)], store, NOW);
    await updateQueue('anas', () => [], store, NOW);
    expect(store.items.has(queueKey('anas'))).toBe(false);

    await updateQueue('anas', () => [entry('a', NOW)], store, NOW);
    await deleteQueue('anas', store);
    expect(store.items.has(queueKey('anas'))).toBe(false);
  });
});
