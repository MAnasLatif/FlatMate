import { supabase } from '@/lib/supabase';

/**
 * Debt simplification (FR-06.5): one step among three people. The debtor
 * owes the middle person, who owes the creditor; once all three accept, the
 * debtor pays the creditor that much directly instead, and nobody's total
 * changes. Steps are private to their three people and admins.
 */
export type DebtTransferState = 'proposed' | 'applied' | 'declined' | 'lapsed';

export type DebtTransferStep = {
  debtorId: string;
  middleId: string;
  creditorId: string;
  amountMinor: number;
};

export type DebtTransfer = DebtTransferStep & {
  id: string;
  state: DebtTransferState;
  proposedBy: string;
  expiresAt: string;
  createdAt: string;
  /** Who has answered, and how. The proposer has accepted by proposing. */
  answers: { userId: string; accepted: boolean }[];
};

/** Steps that would cut the number of transfers, among those the user is part of. */
export async function fetchSuggestions(apartmentId: string): Promise<DebtTransferStep[]> {
  const { data, error } = await supabase.rpc('get_debt_transfer_suggestions', {
    p_apartment_id: apartmentId,
  });
  if (error) throw error;
  return data.map((row) => ({
    debtorId: row.debtor_id,
    middleId: row.middle_id,
    creditorId: row.creditor_id,
    amountMinor: row.amount_minor,
  }));
}

/** The simplifications the user can see, newest first: open ones and the last few closed. */
export async function fetchDebtTransfers(apartmentId: string): Promise<DebtTransfer[]> {
  const { data, error } = await supabase
    .from('debt_transfers')
    .select(
      'id, debtor_id, middle_id, creditor_id, amount_minor, state, proposed_by, expires_at, created_at, debt_transfer_answers(user_id, accepted)',
    )
    .eq('apartment_id', apartmentId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    debtorId: row.debtor_id,
    middleId: row.middle_id,
    creditorId: row.creditor_id,
    amountMinor: row.amount_minor,
    state: row.state as DebtTransferState,
    proposedBy: row.proposed_by,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    answers: row.debt_transfer_answers.map((answer) => ({
      userId: answer.user_id,
      accepted: answer.accepted,
    })),
  }));
}

export async function proposeDebtTransfer(
  apartmentId: string,
  step: DebtTransferStep,
  requestId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('propose_debt_transfer', {
    p_apartment_id: apartmentId,
    p_debtor_id: step.debtorId,
    p_middle_id: step.middleId,
    p_creditor_id: step.creditorId,
    p_amount_minor: step.amountMinor,
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

/** Accepts or declines; returns the state afterwards. */
export async function answerDebtTransfer(
  transferId: string,
  accept: boolean,
): Promise<DebtTransferState> {
  const { data, error } = await supabase.rpc('answer_debt_transfer', {
    p_transfer_id: transferId,
    p_accept: accept,
  });
  if (error) throw error;
  return data as DebtTransferState;
}
