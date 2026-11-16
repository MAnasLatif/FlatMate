import * as aesjs from 'aes-js';

import { EncryptedStorage, type Keychain, type KeyValueStore } from './encrypted-storage';

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

function memoryKeychain(): Keychain & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItemAsync: async (key) => items.get(key) ?? null,
    setItemAsync: async (key, value) => {
      items.set(key, value);
    },
    deleteItemAsync: async (key) => {
      items.delete(key);
    },
  };
}

describe('EncryptedStorage', () => {
  const secret = JSON.stringify({ balance_minor: 125000, name: 'Ali' });

  it('reads back what it wrote', async () => {
    const storage = new EncryptedStorage(memoryStore(), memoryKeychain());
    await storage.setItem('k', secret);
    expect(await storage.getItem('k')).toBe(secret);
  });

  it('never writes the value in plain text, and keeps its key in the keychain', async () => {
    const store = memoryStore();
    const keychain = memoryKeychain();
    await new EncryptedStorage(store, keychain).setItem('k', secret);

    const stored = store.items.get('k') ?? '';
    expect(stored).not.toContain('Ali');
    expect(stored).not.toContain('125000');
    const ring = JSON.parse(keychain.items.get('k') ?? '{}');
    expect(ring.current.key).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.startsWith(`v2.${ring.current.id}.`)).toBe(true);
  });

  it('uses a fresh key for every write', async () => {
    const store = memoryStore();
    const keychain = memoryKeychain();
    const storage = new EncryptedStorage(store, keychain);
    await storage.setItem('k', secret);
    const firstKey = keychain.items.get('k');
    const firstValue = store.items.get('k');
    await storage.setItem('k', secret);
    expect(keychain.items.get('k')).not.toBe(firstKey);
    expect(store.items.get('k')).not.toBe(firstValue);
  });

  it('removes both the value and its key', async () => {
    const store = memoryStore();
    const keychain = memoryKeychain();
    const storage = new EncryptedStorage(store, keychain);
    await storage.setItem('k', secret);
    await storage.removeItem('k');
    expect(store.items.has('k')).toBe(false);
    expect(keychain.items.has('k')).toBe(false);
    expect(await storage.getItem('k')).toBeNull();
  });

  it('still reads a value saved before key ids, then saves in the new format', async () => {
    const store = memoryStore();
    const keychain = memoryKeychain();
    // Written the old way: a bare hex key in the keychain, bare hex in the store.
    const legacyKey = new Uint8Array(32).fill(7);
    const cipher = new aesjs.ModeOfOperation.ctr(legacyKey, new aesjs.Counter(1));
    keychain.items.set('k', aesjs.utils.hex.fromBytes(legacyKey));
    store.items.set(
      'k',
      aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(secret))),
    );

    const storage = new EncryptedStorage(store, keychain);
    expect(await storage.getItem('k')).toBe(secret);

    await storage.setItem('k', 'newer');
    expect(store.items.get('k')).toMatch(/^v2\./);
    expect(await storage.getItem('k')).toBe('newer');
  });

  it('keeps the old value readable when the app stops between saving the key and the value', async () => {
    const store = memoryStore();
    const keychain = memoryKeychain();
    await new EncryptedStorage(store, keychain).setItem('k', secret);

    // The new key reaches the keychain, then the value write never happens.
    const failingStore = {
      ...store,
      setItem: jest.fn(async () => Promise.reject(new Error('killed'))),
    };
    await expect(
      new EncryptedStorage(failingStore, keychain).setItem('k', 'newer'),
    ).rejects.toThrow('killed');

    expect(await new EncryptedStorage(store, keychain).getItem('k')).toBe(secret);
  });

  it('keeps saves that overlap in order, so the value always matches its key', async () => {
    const store = memoryStore();
    const keychain = memoryKeychain();
    // A slow store, so the second save starts before the first one finishes.
    const slowStore = {
      ...store,
      setItem: (key: string, value: string) =>
        new Promise<void>((resolve) => setTimeout(() => resolve(store.setItem(key, value)), 5)),
    };
    const storage = new EncryptedStorage(slowStore, keychain);

    await Promise.all([storage.setItem('k', 'first'), storage.setItem('k', 'second')]);

    expect(await storage.getItem('k')).toBe('second');
  });

  it('reads nothing, not garbage, when the value has no matching key', async () => {
    const store = memoryStore();
    const keychain = memoryKeychain();
    const storage = new EncryptedStorage(store, keychain);
    await storage.setItem('k', secret);
    const savedValue = store.items.get('k') ?? '';
    await storage.setItem('k', 'second');
    await storage.setItem('k', 'third');
    // A value two keys old: neither the current nor the previous key fits it.
    store.items.set('k', savedValue);

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await storage.getItem('k')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reads nothing when the key is gone from the keychain', async () => {
    const store = memoryStore();
    const keychain = memoryKeychain();
    const storage = new EncryptedStorage(store, keychain);
    await storage.setItem('k', secret);
    keychain.items.clear();
    expect(await storage.getItem('k')).toBeNull();
  });
});
