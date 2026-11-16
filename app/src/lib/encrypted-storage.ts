import 'react-native-get-random-values';

import * as aesjs from 'aes-js';

/** A key-value store with AsyncStorage's methods, such as AsyncStorage or expo-sqlite's kv-store. */
export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** The device keychain, with expo-secure-store's methods. Holds small values only. */
export type Keychain = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

/** One encryption key and the id that marks the value it encrypted. */
type KeyEntry = { id: string; key: string };

/** What the keychain holds for a value: the key of the latest write and the one before it. */
type KeyRing = { current: KeyEntry; previous: KeyEntry | null };

/** Values written before key ids existed: hex only, with a bare hex key in the keychain. */
const LEGACY_ID = 'legacy';
const VALUE_PREFIX = 'v2.';
const HEX_KEY = /^[0-9a-f]{64}$/;

/**
 * Encrypted storage for values too large for the keychain, based on Supabase's
 * Expo guide:
 * https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native
 *
 * SecureStore cannot hold values larger than 2048 bytes. So each value gets a
 * fresh AES-256 key, kept in the keychain under the value's key, and the value,
 * encrypted with that key, is kept in the store. It holds the signed-in session
 * and the saved query cache.
 *
 * The key and the value live in two stores, so one write cannot update both
 * at once. To keep them matched:
 * - Each stored value names the id of the key that encrypted it, and the
 *   keychain keeps the previous key as well as the new one. If the app stops
 *   between the two writes, the old value is still read with the old key.
 * - Operations on one value run one at a time, so two saves cannot interleave
 *   and leave one save's key next to the other's value.
 * - A value whose key is gone reads as nothing, never as garbage.
 *
 * Do not "optimize" the encryption. Small changes to how the key or the
 * counter is handled can make it useless: every write needs a fresh key.
 */
export class EncryptedStorage implements KeyValueStore {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: KeyValueStore,
    private readonly keychain: Keychain,
  ) {}

  getItem(key: string): Promise<string | null> {
    return this.serial(key, () => this.read(key));
  }

  setItem(key: string, value: string): Promise<void> {
    return this.serial(key, () => this.write(key, value));
  }

  removeItem(key: string): Promise<void> {
    return this.serial(key, async () => {
      await this.store.removeItem(key);
      await this.keychain.deleteItemAsync(key);
    });
  }

  /** Runs operations on one key in the order they were asked for. */
  private serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(key, settled);
    void settled.then(() => {
      if (this.queues.get(key) === settled) this.queues.delete(key);
    });
    return result;
  }

  private async read(key: string): Promise<string | null> {
    const stored = await this.store.getItem(key);
    if (!stored) return null;
    const ring = parseKeyRing(await this.keychain.getItemAsync(key));
    if (!ring) return null;

    const { id, cipherHex } = parseValue(stored);
    const entry = [ring.current, ring.previous].find((candidate) => candidate?.id === id);
    if (!entry) {
      // No key for this value: it cannot be decrypted, and guessing would
      // return garbage. Callers treat it as never saved.
      console.warn('An encrypted value had no matching key and was ignored.');
      return null;
    }
    return decrypt(entry.key, cipherHex);
  }

  private async write(key: string, value: string): Promise<void> {
    const ring = parseKeyRing(await this.keychain.getItemAsync(key));
    const entry: KeyEntry = {
      id: aesjs.utils.hex.fromBytes(crypto.getRandomValues(new Uint8Array(8))),
      key: aesjs.utils.hex.fromBytes(crypto.getRandomValues(new Uint8Array(256 / 8))),
    };
    const cipherHex = encrypt(entry.key, value);

    // The new key goes in first, next to the current one, so whichever value
    // the store holds if the app stops here still has its key.
    const next: KeyRing = { current: entry, previous: ring?.current ?? null };
    await this.keychain.setItemAsync(key, JSON.stringify(next));
    await this.store.setItem(key, `${VALUE_PREFIX}${entry.id}.${cipherHex}`);
  }
}

function encrypt(keyHex: string, value: string): string {
  const cipher = new aesjs.ModeOfOperation.ctr(
    aesjs.utils.hex.toBytes(keyHex),
    new aesjs.Counter(1),
  );
  return aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(value)));
}

function decrypt(keyHex: string, cipherHex: string): string {
  const cipher = new aesjs.ModeOfOperation.ctr(
    aesjs.utils.hex.toBytes(keyHex),
    new aesjs.Counter(1),
  );
  return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(cipherHex)));
}

/** Splits a stored value into its key id and ciphertext. Older values are hex only. */
function parseValue(stored: string): { id: string; cipherHex: string } {
  if (!stored.startsWith(VALUE_PREFIX)) return { id: LEGACY_ID, cipherHex: stored };
  const rest = stored.slice(VALUE_PREFIX.length);
  const dot = rest.indexOf('.');
  // A malformed value gets an id no key has, so it reads as nothing.
  if (dot < 0) return { id: '', cipherHex: '' };
  return { id: rest.slice(0, dot), cipherHex: rest.slice(dot + 1) };
}

/** Reads the keychain entry: a key ring, or a bare key from before key ids existed. */
function parseKeyRing(raw: string | null): KeyRing | null {
  if (!raw) return null;
  if (HEX_KEY.test(raw)) return { current: { id: LEGACY_ID, key: raw }, previous: null };
  try {
    const parsed = JSON.parse(raw) as Partial<KeyRing>;
    if (!isKeyEntry(parsed.current)) return null;
    return {
      current: parsed.current,
      previous: isKeyEntry(parsed.previous) ? parsed.previous : null,
    };
  } catch {
    return null;
  }
}

function isKeyEntry(value: unknown): value is KeyEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string' && typeof entry.key === 'string' && HEX_KEY.test(entry.key);
}
