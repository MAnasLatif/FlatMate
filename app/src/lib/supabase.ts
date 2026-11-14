import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

import type { Database } from '@/types/database';

import { EncryptedStorage } from './encrypted-storage';
import { getEnv } from './env';
import { installSubtleDigest } from './web-crypto';

installSubtleDigest();

const env = getEnv();

// The publishable key is public by design. Access is controlled by row-level
// security in the database, never by keeping this key secret.
export const supabase = createClient<Database>(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      // The session is encrypted: its key in the keychain, the session in AsyncStorage.
      storage: new EncryptedStorage(AsyncStorage, SecureStore),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // Google sign-in returns a one-time code that the app exchanges for a session.
      flowType: 'pkce',
    },
  },
);

// Token refresh runs on a timer, which must not keep ticking while the app is
// in the background.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
