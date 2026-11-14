// Delivers queued notifications as Expo push messages (task 1.43).
//
// pg_cron calls this every few seconds while anything is due (see
// private.request_push_delivery in the notifications migration). Every
// decision lives in the database: who is told, the lock-screen text, retries
// and dead tokens. This function only claims a batch, hands it to Expo, and
// reports what Expo said. It logs counts, never content or tokens.

import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
const EXPO_BATCH_SIZE = 100;
/** Batches per run; a busier queue continues on the next run. */
const MAX_BATCHES_PER_RUN = 10;
const EXPO_TIMEOUT_MS = 10_000;
/** The Android channel the app creates; without it Android shows nothing. */
const ANDROID_CHANNEL_ID = 'default';

type Claimed = { notification_id: string; token: string; body: string };
type PushResult = { notification_id: string; token: string; ok: boolean; error?: string };
type ExpoTicket = { status: 'ok' | 'error'; details?: { error?: string } };

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

/** Sends up to 100 messages and turns Expo's tickets into results, in order. */
async function sendToExpo(messages: Claimed[]): Promise<PushResult[]> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  };
  // Set only when enhanced push security is turned on for the Expo project.
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
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
      ? { notification_id: m.notification_id, token: m.token, ok: true }
      : {
          notification_id: m.notification_id,
          token: m.token,
          ok: false,
          error: ticket?.details?.error ?? 'UnknownError',
        };
  });
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
  return Response.json({ sent, failed });
});
