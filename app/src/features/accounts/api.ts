import { supabase } from '@/lib/supabase';

export type AccountKind = 'bank' | 'wallet';

/** An account the user can be paid into. Private unless shared with an apartment. */
export type ReceivingAccount = {
  id: string;
  kind: AccountKind;
  provider: string;
  accountTitle: string;
  accountIdentifier: string;
  isPreferred: boolean;
};

/** One of the user's own accounts, with the apartments it is shared with. */
export type MyAccount = ReceivingAccount & { sharedWith: string[] };

export type AccountInput = Omit<ReceivingAccount, 'id' | 'isPreferred'>;

const COLUMNS = 'id, kind, provider, account_title, account_identifier, is_preferred';

type Row = {
  id: string;
  kind: string;
  provider: string;
  account_title: string;
  account_identifier: string;
  is_preferred: boolean;
};

function toAccount(row: Row): ReceivingAccount {
  return {
    id: row.id,
    kind: row.kind as AccountKind,
    provider: row.provider,
    accountTitle: row.account_title,
    accountIdentifier: row.account_identifier,
    isPreferred: row.is_preferred,
  };
}

/** The signed-in user's accounts. Row-level security only returns their own. */
export async function fetchMyAccounts(): Promise<MyAccount[]> {
  const { data, error } = await supabase
    .from('receiving_accounts')
    .select(`${COLUMNS}, shares:receiving_account_shares(apartment_id)`)
    .order('is_preferred', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    ...toAccount(row),
    sharedWith: row.shares.map((share) => share.apartment_id),
  }));
}

/** The accounts one member shares with an apartment, for its current members (SRS FR-07.2). */
export async function fetchSharedAccounts(
  apartmentId: string,
  userId: string,
): Promise<ReceivingAccount[]> {
  const { data, error } = await supabase.rpc('get_shared_accounts', {
    p_apartment_id: apartmentId,
    p_user_id: userId,
  });
  if (error) throw error;
  return data.map(toAccount);
}

export async function createAccount(userId: string, input: AccountInput): Promise<string> {
  const { data, error } = await supabase
    .from('receiving_accounts')
    .insert({
      user_id: userId,
      kind: input.kind,
      provider: input.provider,
      account_title: input.accountTitle,
      account_identifier: input.accountIdentifier,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateAccount(accountId: string, input: AccountInput): Promise<void> {
  const { error } = await supabase
    .from('receiving_accounts')
    .update({
      kind: input.kind,
      provider: input.provider,
      account_title: input.accountTitle,
      account_identifier: input.accountIdentifier,
    })
    .eq('id', accountId);
  if (error) throw error;
}

export async function deleteAccount(accountId: string): Promise<void> {
  const { error } = await supabase.from('receiving_accounts').delete().eq('id', accountId);
  if (error) throw error;
}

/**
 * Makes one account the preferred one. The database allows only one, so the
 * current one is cleared first; if the second step fails, none is preferred.
 */
export async function setPreferredAccount(userId: string, accountId: string): Promise<void> {
  const { error: clearError } = await supabase
    .from('receiving_accounts')
    .update({ is_preferred: false })
    .eq('user_id', userId)
    .eq('is_preferred', true);
  if (clearError) throw clearError;
  const { error } = await supabase
    .from('receiving_accounts')
    .update({ is_preferred: true })
    .eq('id', accountId);
  if (error) throw error;
}

export async function shareAccount(accountId: string, apartmentId: string): Promise<void> {
  const { error } = await supabase
    .from('receiving_account_shares')
    .upsert(
      { account_id: accountId, apartment_id: apartmentId },
      { onConflict: 'account_id,apartment_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function unshareAccount(accountId: string, apartmentId: string): Promise<void> {
  const { error } = await supabase
    .from('receiving_account_shares')
    .delete()
    .eq('account_id', accountId)
    .eq('apartment_id', apartmentId);
  if (error) throw error;
}
