// Emails a join code to someone an admin invites (SRS FR-02.4).
//
// The app calls this with the admin's own token. Every decision lives in the
// database: private.prepare_invite_email checks that the caller is an admin,
// checks the address, applies the daily limits and gives the apartment's one
// join code. This function only validates the request, asks for that code, and
// hands the email to the provider. The code is the one admins also share, so a
// failed email leaves it as it is.
//
// It logs events and status codes, never addresses, names or codes.

import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const RESEND_URL = 'https://api.resend.com/emails';
const PROVIDER_TIMEOUT_MS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EMAIL_LENGTH = 254;

/** Stable error keys; the app turns them into sentences. */
type ErrorKey =
  | 'invalid_request'
  | 'invalid_email'
  | 'not_admin'
  | 'rate_limited'
  | 'send_failed'
  | 'not_configured'
  | 'unknown';

const STATUS: Record<ErrorKey, number> = {
  invalid_request: 400,
  invalid_email: 400,
  not_admin: 403,
  rate_limited: 429,
  send_failed: 502,
  not_configured: 500,
  unknown: 500,
};

/** The database raises these as the error message. */
const DATABASE_ERRORS = new Set<ErrorKey>(['invalid_email', 'not_admin', 'rate_limited']);

type Prepared = {
  code: string;
  apartment_name: string;
  inviter_name: string | null;
};

type Email = { to: string; subject: string; text: string };

function fail(error: ErrorKey): Response {
  return Response.json({ error }, { status: STATUS[error] });
}

/** The project's publishable key, so the database sees the caller's own rights. */
function publishableKey(): string {
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (!legacy) throw new Error('No Supabase publishable key is available to the function.');
  return legacy;
}

/** The request body, or null when it is not `{ apartmentId, email }` with sane values. */
async function readBody(request: Request): Promise<{ apartmentId: string; email: string } | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const { apartmentId, email } = body as Record<string, unknown>;
  if (typeof apartmentId !== 'string' || !UUID.test(apartmentId)) return null;
  if (typeof email !== 'string' || email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  return { apartmentId, email: email.trim() };
}

/** Names typed by users go into a header, so they lose line breaks and stay short. */
function oneLine(value: string, maxLength = 80): string {
  return value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLength);
}

function inviteEmail(to: string, prepared: Prepared): Email {
  const apartment = oneLine(prepared.apartment_name);
  const inviter = prepared.inviter_name ? oneLine(prepared.inviter_name) : null;
  return {
    to,
    subject: inviter
      ? `${inviter} invited you to ${apartment} on FlatMate`
      : `You're invited to ${apartment} on FlatMate`,
    text: [
      `${inviter ?? 'An admin'} invited you to share ${apartment} on FlatMate, the app flatmates use to split shared costs.`,
      '',
      `Your join code: ${prepared.code}`,
      '',
      '1. Install FlatMate and sign in.',
      '2. Choose Join by code and enter the code.',
      `3. An admin of ${apartment} lets you in.`,
      '',
      'If you were not expecting this email, you can ignore it.',
    ].join('\n'),
  };
}

/** "FlatMate <invites@example.com>" as Mailpit wants it. */
function parseSender(from: string): { Name: string; Email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return match ? { Name: match[1], Email: match[2] } : { Name: '', Email: from.trim() };
}

/**
 * Hands the email to Resend, or to the local Mailpit in development. Returns
 * the provider's status for the logs, or null when it could not be reached.
 */
async function deliver(email: Email, from: string): Promise<{ ok: boolean; status: number | null }> {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const mailpitUrl = Deno.env.get('MAILPIT_URL');

  let request: Request;
  if (resendKey) {
    request = new Request(RESEND_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text }),
    });
  } else if (mailpitUrl) {
    request = new Request(`${mailpitUrl}/api/v1/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        From: parseSender(from),
        To: [{ Email: email.to }],
        Subject: email.subject,
        Text: email.text,
      }),
    });
  } else {
    throw new Error('No email provider is configured.');
  }

  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
    await response.body?.cancel();
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: null };
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });

  const from = Deno.env.get('INVITE_EMAIL_FROM');
  if (!from || !(Deno.env.get('RESEND_API_KEY') || Deno.env.get('MAILPIT_URL'))) {
    console.error(JSON.stringify({ event: 'misconfigured', reason: 'no email provider or sender' }));
    return fail('not_configured');
  }

  // The platform has already checked the token (verify_jwt); the database
  // checks what its owner may do.
  const authorization = request.headers.get('authorization');
  if (!authorization) return new Response(null, { status: 401 });

  const body = await readBody(request);
  if (!body) return fail('invalid_request');

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', publishableKey(), {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('prepare_invite_email', {
    p_apartment_id: body.apartmentId,
    p_email: body.email,
  });
  if (error) {
    const key = DATABASE_ERRORS.has(error.message as ErrorKey) ? (error.message as ErrorKey) : 'unknown';
    if (key === 'unknown') console.error(JSON.stringify({ event: 'prepare_failed', code: error.code }));
    return fail(key);
  }

  const prepared = data as Prepared;
  const result = await deliver(inviteEmail(body.email, prepared), from);
  if (!result.ok) {
    console.error(JSON.stringify({ event: 'send_failed', status: result.status }));
    return fail('send_failed');
  }

  console.log(JSON.stringify({ event: 'sent' }));
  return Response.json({ sent: true });
});
