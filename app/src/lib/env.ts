import { z } from 'zod';

const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  // Shows the Google sign-in button. Turn on only once the Google provider is
  // configured in the Supabase project.
  EXPO_PUBLIC_AUTH_GOOGLE_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

type EnvSource = Partial<Record<keyof Env, string>>;

/**
 * Validates the app's configuration. The error names the variables that are
 * missing or malformed and never includes their values.
 */
export function parseEnv(source: EnvSource): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(
      `Missing or invalid environment variables: ${names.join(', ')}. ` +
        'Copy .env.example to .env and fill them in.',
    );
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  // Expo only inlines EXPO_PUBLIC_ variables that are read as static
  // `process.env.NAME` expressions, so each one is listed explicitly.
  cached ??= parseEnv({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_AUTH_GOOGLE_ENABLED: process.env.EXPO_PUBLIC_AUTH_GOOGLE_ENABLED,
  });
  return cached;
}
