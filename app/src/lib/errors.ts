const NETWORK_MESSAGE = 'Could not reach FlatMate. Check your connection and try again.';

/**
 * A sentence to show the user when a database, storage or function call fails.
 * Server messages are never shown as-is, since they can expose internals.
 *
 * `known` maps the stable error keys our database functions raise (such as
 * "last_admin") or a Postgres error code (such as "23505") to a sentence.
 * Anything else gets `fallback`.
 */
export function userErrorMessage(
  error: unknown,
  fallback: string,
  known: Record<string, string> = {},
): string {
  if (isNetworkError(error)) {
    return NETWORK_MESSAGE;
  }
  const message = stringField(error, 'message');
  if (message && message in known) {
    return known[message];
  }
  const code = stringField(error, 'code');
  if (code && code in known) {
    return known[code];
  }
  return fallback;
}

function stringField(error: unknown, field: 'message' | 'code'): string | undefined {
  if (typeof error === 'object' && error !== null && field in error) {
    const value = (error as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

export function isNetworkError(error: unknown): boolean {
  const message = stringField(error, 'message');
  return message !== undefined && /network request failed|failed to fetch/i.test(message);
}

/**
 * Error codes that can succeed on a second try: serialization failure,
 * deadlock and statement timeout from Postgres, and PostgREST's errors for
 * reaching the database. Every other code is the server's final answer.
 */
const TRANSIENT_CODES = new Set([
  '40001',
  '40P01',
  '57014',
  'PGRST000',
  'PGRST001',
  'PGRST002',
  'PGRST003',
]);

/**
 * Whether trying the same request again could give a different answer. A
 * permission or validation error will not, so retrying it only delays the
 * message the user needs to see.
 */
export function isRetryableError(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  const code = stringField(error, 'code');
  if (code) return TRANSIENT_CODES.has(code);
  const status = storageStatusOf(error);
  if (status !== undefined && status >= 400 && status < 500) {
    return status === 408 || status === 429;
  }
  return true;
}

/**
 * The status that explains a failed storage request. Storage answers some
 * failures with HTTP 400 and puts the real reason (such as 413) in statusCode,
 * so statusCode wins when present.
 */
export function storageStatusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('statusCode' in error && typeof error.statusCode === 'string') {
    const parsed = Number.parseInt(error.statusCode, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if ('status' in error && typeof error.status === 'number') return error.status;
  return undefined;
}
