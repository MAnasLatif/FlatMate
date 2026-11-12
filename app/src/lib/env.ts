import { z } from 'zod';

const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

type EnvSource = Record<keyof Env, string | undefined>;

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
  });
  return cached;
}
