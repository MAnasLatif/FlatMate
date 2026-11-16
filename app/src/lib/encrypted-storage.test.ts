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
    expect(keychain.items.get('k')).toMatch(/^[0-9a-f]{64}$/);
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

  it('reads nothing when the key is gone from the keychain', async () => {
    const store = memoryStore();
    const keychain = memoryKeychain();
    const storage = new EncryptedStorage(store, keychain);
    await storage.setItem('k', secret);
    keychain.items.clear();
    expect(await storage.getItem('k')).toBeNull();
  });
});
