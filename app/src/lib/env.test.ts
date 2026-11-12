import { parseEnv } from './env';

const valid = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
};

describe('parseEnv', () => {
  it('returns the configuration when every variable is valid', () => {
    expect(parseEnv(valid)).toEqual(valid);
  });

  it('names a missing variable', () => {
    expect(() => parseEnv({ ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined })).toThrow(
      /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it('rejects an empty key', () => {
    expect(() => parseEnv({ ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' })).toThrow(
      /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it('rejects a URL that is not a URL', () => {
    expect(() => parseEnv({ ...valid, EXPO_PUBLIC_SUPABASE_URL: 'not a url' })).toThrow(
      /EXPO_PUBLIC_SUPABASE_URL/,
    );
  });

  it('lists every invalid variable and leaves the values out of the message', () => {
    const secret = 'do-not-print-me';
    let message = '';
    try {
      parseEnv({ EXPO_PUBLIC_SUPABASE_URL: secret, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(message).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    expect(message).not.toContain(secret);
  });
});
