// Delivers queued notifications as Expo push messages (task 1.43), and reads
// their receipts about 15 minutes later (task 2.5.1).
//
// pg_cron calls this every few seconds while anything is due (see
// private.request_push_delivery). Every decision lives in the database: who
// is told, the lock-screen text, retries, dead tokens and when a receipt is
// due. This function only claims a batch, hands it to Expo, and reports what
// Expo said. It logs counts and error codes, never content or tokens.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo returns at most 1000 receipts per request. */
const EXPO_RECEIPT_BATCH_SIZE = 1000;
/**
 * Receipt errors that mean every push fails until a maintainer fixes the
 * credentials in EAS or Firebase (docs/NOTIFICATIONS.md, Troubleshooting).
 */
const CREDENTIAL_ERRORS = new Set(['InvalidCredentials', 'MismatchSenderId', 'InvalidProviderToken']);
/** Expo accepts at most 100 messages per request. */
const EXPO_BATCH_SIZE = 100;
/** Batches per run; a busier queue continues on the next run. */
const MAX_BATCHES_PER_RUN = 10;
const EXPO_TIMEOUT_MS = 10_000;
/** The Android channel the app creates; without it Android shows nothing. */
const ANDROID_CHANNEL_ID = 'default';

type Claimed = { notification_id: string; token: string; body: string };
type PushResult = {
  notification_id: string;
  token: string;
  ok: boolean;
  error?: string;
  ticket_id?: string;
};
type ExpoTicket = { status: 'ok' | 'error'; id?: string; details?: { error?: string } };
type ExpoReceipt = { status: 'ok' | 'error'; details?: { error?: string } };
type ReceiptResult = { ticket_id: string; status: 'ok' | 'error' | 'missing'; error?: string };

/** Compares the delivery secret without leaking how much of it matched. */
function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

/** The project's secret key, which only this function holds. */
function serviceKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error('No Supabase secret key is available to the function.');
  return legacy;
}

function failAll(messages: Claimed[], error: string): PushResult[] {
  return messages.map((m) => ({ notification_id: m.notification_id, token: m.token, ok: false, error }));
}

function expoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  };
  // Set only when enhanced push security is turned on for the Expo project.
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return headers;
}

/**
 * Asks Expo for up to 1000 receipts. An id Expo has no receipt for yet is
 * missing, and so is every id when Expo cannot be reached: the database asks
 * again later, and gives up after a day.
 */
async function fetchReceipts(ticketIds: string[]): Promise<ReceiptResult[]> {
  const missing = (): ReceiptResult[] =>
    ticketIds.map((ticket_id) => ({ ticket_id, status: 'missing' }));
  let response: Response;
  try {
    response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: expoHeaders(),
      body: JSON.stringify({ ids: ticketIds }),
      signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
    });
  } catch {
    console.error(JSON.stringify({ event: 'receipts_unreachable' }));
    return missing();
  }
  if (!response.ok) {
    console.error(JSON.stringify({ event: 'receipts_failed', status: response.status }));
    return missing();
  }

  const { data } = (await response.json()) as { data?: Record<string, ExpoReceipt> };
  return ticketIds.map((ticket_id) => {
    const receipt = data?.[ticket_id];
    if (!receipt) return { ticket_id, status: 'missing' };
    return receipt.status === 'ok'
      ? { ticket_id, status: 'ok' }
      : { ticket_id, status: 'error', error: receipt.details?.error ?? 'UnknownError' };
  });
}

/** Sends up to 100 messages and turns Expo's tickets into results, in order. */
async function sendToExpo(messages: Claimed[]): Promise<PushResult[]> {
  let response: Response;
  try {
    response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: expoHeaders(),
      body: JSON.stringify(
        messages.map((m) => ({
          to: m.token,
          title: 'FlatMate',
          body: m.body,
          // The app opens the notification by its id and checks access there.
          data: { notificationId: m.notification_id },
          channelId: ANDROID_CHANNEL_ID,
          sound: 'default',
          priority: 'high',
        })),
      ),
      signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
    });
  } catch {
    return failAll(messages, 'ExpoUnreachable');
  }
  if (!response.ok) {
    return failAll(messages, response.status === 429 ? 'MessageRateExceeded' : `ExpoHttp${response.status}`);
  }

  const { data } = (await response.json()) as { data?: ExpoTicket[] };
  return messages.map((m, index) => {
    const ticket = data?.[index];
    return ticket?.status === 'ok'
      ? { notification_id: m.notification_id, token: m.token, ok: true, ticket_id: ticket.id }
      : {
          notification_id: m.notification_id,
          token: m.token,
          ok: false,
          error: ticket?.details?.error ?? 'UnknownError',
        };
  });
}

/**
 * Reads the receipts that are due, one batch per run. Returns how many were
 * checked, or null when the database could not be reached. Errors are logged
 * by code; credential errors as errors, since every push fails until a
 * maintainer fixes them.
 */
async function checkReceipts(supabase: SupabaseClient): Promise<number | null> {
  const { data, error } = await supabase.rpc('claim_push_receipts', {
    p_limit: EXPO_RECEIPT_BATCH_SIZE,
  });
  if (error) {
    console.error(JSON.stringify({ event: 'receipt_claim_failed', code: error.code }));
    return null;
  }
  const ticketIds = ((data ?? []) as { ticket_id: string }[]).map((row) => row.ticket_id);
  if (ticketIds.length === 0) return 0;

  const results = await fetchReceipts(ticketIds);
  const report = await supabase.rpc('report_push_receipts', { p_results: results });
  if (report.error) {
    // Unreported claims are taken again after five minutes.
    console.error(JSON.stringify({ event: 'receipt_report_failed', code: report.error.code }));
    return null;
  }

  const errors: Record<string, number> = {};
  for (const result of results) {
    if (result.status === 'error' && result.error) {
      errors[result.error] = (errors[result.error] ?? 0) + 1;
    }
  }
  const credentialErrors = Object.keys(errors).filter((code) => CREDENTIAL_ERRORS.has(code));
  if (credentialErrors.length > 0) {
    console.error(
      JSON.stringify({ event: 'push_credentials_invalid', errors: credentialErrors }),
    );
  }
  console.log(
    JSON.stringify({
      event: 'receipts_checked',
      ok: results.filter((r) => r.status === 'ok').length,
      missing: results.filter((r) => r.status === 'missing').length,
      errors,
    }),
  );
  return ticketIds.length;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });

  const expected = Deno.env.get('PUSH_DELIVERY_SECRET');
  if (!expected) {
    console.error(JSON.stringify({ event: 'misconfigured', reason: 'PUSH_DELIVERY_SECRET is not set' }));
    return new Response(null, { status: 500 });
  }
  if (!secretMatches(request.headers.get('x-push-delivery-secret'), expected)) {
    return new Response(null, { status: 401 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let sent = 0;
  let failed = 0;
  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
    const { data, error } = await supabase.rpc('claim_pushes', { p_limit: EXPO_BATCH_SIZE });
    if (error) {
      console.error(JSON.stringify({ event: 'claim_failed', code: error.code }));
      return new Response(null, { status: 500 });
    }
    const claimed = (data ?? []) as Claimed[];
    if (claimed.length === 0) break;

    const results: PushResult[] = [];
    for (let start = 0; start < claimed.length; start += EXPO_BATCH_SIZE) {
      results.push(...(await sendToExpo(claimed.slice(start, start + EXPO_BATCH_SIZE))));
    }

    const report = await supabase.rpc('report_pushes', { p_results: results });
    if (report.error) {
      // Unreported claims are taken again after five minutes.
      console.error(JSON.stringify({ event: 'report_failed', code: report.error.code }));
      return new Response(null, { status: 500 });
    }
    sent += results.filter((r) => r.ok).length;
    failed += results.filter((r) => !r.ok).length;

    const notifications = new Set(claimed.map((c) => c.notification_id)).size;
    if (notifications < EXPO_BATCH_SIZE) break;
  }

  console.log(JSON.stringify({ event: 'delivered', sent, failed }));

  const receipts = await checkReceipts(supabase);
  if (receipts === null) return new Response(null, { status: 500 });
  return Response.json({ sent, failed, receipts });
});
