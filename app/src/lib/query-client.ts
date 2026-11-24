import { QueryClient } from '@tanstack/react-query';

import { isRetryableError } from './errors';

const MAX_QUERY_RETRIES = 2;

/**
 * How long loaded data is kept, in memory and in the saved copy on the device
 * (SRS section 7). React Query's default of 5 minutes would drop most of it
 * before it could be read offline.
 */
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Retries a failed read a couple of times, but only when retrying could help. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isRetryableError(error);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetryQuery, gcTime: CACHE_MAX_AGE_MS },
    // A write is never held back while offline and sent later without the user
    // seeing it happen (SRS section 7). Offline, it fails at once with the
    // connection message, and screens disable their save buttons beforehand.
    mutations: { networkMode: 'always', retry: false },
  },
});
