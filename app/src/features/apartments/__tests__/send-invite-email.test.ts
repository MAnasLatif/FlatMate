import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

import { sendInviteEmail } from '../api';

jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));

const invoke = jest.mocked(supabase.functions.invoke);
const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function httpError(body: unknown): FunctionsHttpError {
  return new FunctionsHttpError({ json: () => Promise.resolve(body) });
}

it('sends the apartment and address to the Edge Function', async () => {
  invoke.mockResolvedValue({ data: { sent: true }, error: null });

  await sendInviteEmail(APARTMENT, 'friend@example.com');

  expect(invoke).toHaveBeenCalledWith('send-invite-email', {
    body: { apartmentId: APARTMENT, email: 'friend@example.com' },
  });
});

it("fails with the function's error key", async () => {
  invoke.mockResolvedValue({ data: null, error: httpError({ error: 'rate_limited' }) });

  await expect(sendInviteEmail(APARTMENT, 'friend@example.com')).rejects.toThrow('rate_limited');
});

it('fails with unknown when the error has no key', async () => {
  invoke.mockResolvedValue({ data: null, error: httpError('<html>') });

  await expect(sendInviteEmail(APARTMENT, 'friend@example.com')).rejects.toThrow('unknown');
});

it('fails with unreachable when the function cannot be reached', async () => {
  invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new Error('offline')) });

  await expect(sendInviteEmail(APARTMENT, 'friend@example.com')).rejects.toThrow('unreachable');
});
