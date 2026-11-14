import { installSubtleDigest } from './web-crypto';

const mockRequireOptionalNativeModule = jest.fn();
const mockDigest = jest.fn();

jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => mockRequireOptionalNativeModule(name),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: (algorithm: string, data: unknown) => mockDigest(algorithm, data),
}));

const globalCrypto = globalThis as unknown as { crypto: { subtle?: SubtleCrypto } };
let originalSubtle: SubtleCrypto | undefined;

beforeEach(() => {
  originalSubtle = globalCrypto.crypto.subtle;
  // Mimic React Native, which has getRandomValues (polyfilled) but no subtle.
  Object.defineProperty(globalCrypto.crypto, 'subtle', {
    value: undefined,
    writable: true,
    configurable: true,
  });
  mockRequireOptionalNativeModule.mockReset();
  mockDigest.mockReset();
});

afterEach(() => {
  Object.defineProperty(globalCrypto.crypto, 'subtle', {
    value: originalSubtle,
    writable: true,
    configurable: true,
  });
});

describe('installSubtleDigest', () => {
  it('hashes SHA-256 through expo-crypto when the native module is in the build', async () => {
    mockRequireOptionalNativeModule.mockReturnValue({});
    const hash = new ArrayBuffer(32);
    mockDigest.mockResolvedValue(hash);
    const data = new Uint8Array([1, 2, 3]);

    installSubtleDigest();

    await expect(globalCrypto.crypto.subtle?.digest('SHA-256', data)).resolves.toBe(hash);
    expect(mockRequireOptionalNativeModule).toHaveBeenCalledWith('ExpoCrypto');
    expect(mockDigest).toHaveBeenCalledWith('SHA-256', data);
  });

  it('rejects algorithms other than SHA-256', async () => {
    mockRequireOptionalNativeModule.mockReturnValue({});

    installSubtleDigest();

    await expect(
      globalCrypto.crypto.subtle?.digest({ name: 'SHA-1' }, new Uint8Array()),
    ).rejects.toThrow('unsupported algorithm SHA-1');
    expect(mockDigest).not.toHaveBeenCalled();
  });

  it('leaves crypto.subtle missing on a build without the native module', () => {
    mockRequireOptionalNativeModule.mockReturnValue(null);

    installSubtleDigest();

    expect(globalCrypto.crypto.subtle).toBeUndefined();
  });

  it('keeps an existing crypto.subtle', () => {
    const existing = { digest: jest.fn() } as unknown as SubtleCrypto;
    globalCrypto.crypto.subtle = existing;

    installSubtleDigest();

    expect(globalCrypto.crypto.subtle).toBe(existing);
    expect(mockRequireOptionalNativeModule).not.toHaveBeenCalled();
  });
});
