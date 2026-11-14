import { requireOptionalNativeModule } from 'expo';

type DigestInput = Parameters<SubtleCrypto['digest']>[1];

/**
 * React Native has no WebCrypto `crypto.subtle`, so Supabase Auth falls back
 * to the weaker "plain" PKCE challenge, which sends the secret verifier itself
 * instead of its SHA-256 hash. This adds the one method it needs, `digest`,
 * backed by expo-crypto's native hashing.
 *
 * A build made before expo-crypto was added lacks the native module; there the
 * shim stays off and Auth keeps its plain fallback instead of crashing.
 */
export function installSubtleDigest(): void {
  const target = globalThis as { crypto?: { subtle?: unknown } };
  if (!target.crypto || target.crypto.subtle !== undefined) return;
  if (!requireOptionalNativeModule('ExpoCrypto')) return;

  // Loaded only now: importing expo-crypto at the top of the file would throw
  // on a build without its native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CryptoDigestAlgorithm, digest } = require('expo-crypto') as typeof import('expo-crypto');

  target.crypto.subtle = {
    async digest(algorithm: AlgorithmIdentifier, data: DigestInput): Promise<ArrayBuffer> {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (name !== 'SHA-256') {
        throw new Error(`crypto.subtle.digest: unsupported algorithm ${name}`);
      }
      return digest(CryptoDigestAlgorithm.SHA256, data);
    },
  };
}
