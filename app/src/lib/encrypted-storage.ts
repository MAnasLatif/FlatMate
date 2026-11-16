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

/**
 * Encrypted storage for values too large for the keychain, taken from
 * Supabase's Expo guide:
 * https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native
 *
 * SecureStore cannot hold values larger than 2048 bytes. So each value gets a
 * fresh AES-256 key, kept in the keychain under the value's key, and the value,
 * encrypted with that key, is kept in the store. It holds the signed-in session
 * and the saved query cache.
 *
 * Do not "optimize" this class. Small changes to how the key or the counter
 * is handled can make the encryption useless.
 */
export class EncryptedStorage implements KeyValueStore {
  constructor(
    private readonly store: KeyValueStore,
    private readonly keychain: Keychain,
  ) {}

  private async _encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));

    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await this.keychain.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));

    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async _decrypt(key: string, value: string) {
    const encryptionKeyHex = await this.keychain.getItemAsync(key);
    if (!encryptionKeyHex) {
      return encryptionKeyHex;
    }

    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));

    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string) {
    const encrypted = await this.store.getItem(key);
    if (!encrypted) {
      return encrypted;
    }

    return await this._decrypt(key, encrypted);
  }

  async removeItem(key: string) {
    await this.store.removeItem(key);
    await this.keychain.deleteItemAsync(key);
  }

  async setItem(key: string, value: string) {
    const encrypted = await this._encrypt(key, value);

    await this.store.setItem(key, encrypted);
  }
}
