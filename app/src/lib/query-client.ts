import { QueryClient } from '@tanstack/react-query';

import { isRetryableError } from './errors';

const MAX_QUERY_RETRIES = 2;

/** Retries a failed read a couple of times, but only when retrying could help. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isRetryableError(error);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetryQuery },
    // A write is never held back while offline and sent later without the user
    // seeing it happen (decision 0007). Offline, it fails at once with the
    // connection message, and screens disable their save buttons beforehand.
    mutations: { networkMode: 'always', retry: false },
  },
});
