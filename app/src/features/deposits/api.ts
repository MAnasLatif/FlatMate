import { toRpcParticipants } from '@/features/expenses/api';
import type { Contribution, SplitMethod, SplitParticipant } from '@/features/expenses/split';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

/**
 * A security deposit paid to the landlord, with each member's share (FR-10.4,
 * decision 0015). Shares are never stored as numbers: each is the sum of its
 * holder's entries, which actions only ever add to.
 */
export type DepositActionKind = 'recorded' | 'taken_over' | 'refunded' | 'returned' | 'undone';

export type DepositEntryKind = 'share' | 'transfer_in' | 'transfer_out' | 'refund' | 'deduction';

export type Deduction = { amountMinor: number; reason: string };

export type DepositAction = {
  id: string;
  kind: DepositActionKind;
  /** The order actions happened in. */
  position: number;
  reversesActionId: string | null;
  deductions: Deduction[];
  /** For a return, who the landlord paid it back to. */
  receivedBy: string | null;
  createdBy: string;
  createdAt: string;
};

export type DepositEntry = {
  actionId: string;
  userId: string;
  kind: DepositEntryKind;
  /** Signed: what it adds to the holder's share. */
  amountMinor: number;
  counterpartyId: string | null;
  reason: string | null;
};

export type Deposit = {
  id: string;
  title: string;
  amountMinor: number;
  paidOn: string;
  heldBy: string | null;
  /** Oldest first. */
  actions: DepositAction[];
  entries: DepositEntry[];
};

function toDeductions(value: Json): Deduction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item !== null &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    typeof item.amount_minor === 'number' &&
    typeof item.reason === 'string'
      ? [{ amountMinor: item.amount_minor, reason: item.reason }]
      : [],
  );
}

function toRpcDeductions(deductions: readonly Deduction[]) {
  return deductions.map((item) => ({ amount_minor: item.amountMinor, reason: item.reason }));
}

/** The apartment's deposits, newest first, with their actions and entries. */
export async function fetchDeposits(apartmentId: string): Promise<Deposit[]> {
  const { data, error } = await supabase
    .from('deposits')
    .select(
      `id, title, amount_minor, paid_on, held_by,
       actions:deposit_actions(id, kind, position, reverses_action_id, deductions, received_by, created_by, created_at),
       entries:deposit_entries(action_id, user_id, kind, amount_minor, counterparty_id, reason)`,
    )
    .eq('apartment_id', apartmentId)
    .order('paid_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    amountMinor: row.amount_minor,
    paidOn: row.paid_on,
    heldBy: row.held_by,
    actions: row.actions
      .map((action) => ({
        id: action.id,
        kind: action.kind as DepositActionKind,
        position: action.position,
        reversesActionId: action.reverses_action_id,
        deductions: toDeductions(action.deductions),
        receivedBy: action.received_by,
        createdBy: action.created_by,
        createdAt: action.created_at,
      }))
      .sort((a, b) => a.position - b.position),
    entries: row.entries.map((entry) => ({
      actionId: entry.action_id,
      userId: entry.user_id,
      kind: entry.kind as DepositEntryKind,
      amountMinor: entry.amount_minor,
      counterpartyId: entry.counterparty_id,
      reason: entry.reason,
    })),
  }));
}

export type NewDeposit = {
  title: string;
  amountMinor: number;
  paidOn: string;
  heldBy: string | null;
  payers: Contribution[];
  splitMethod: SplitMethod;
  participants: SplitParticipant[];
};

export async function recordDeposit(
  apartmentId: string,
  deposit: NewDeposit,
  requestId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('record_deposit', {
    p_apartment_id: apartmentId,
    p_title: deposit.title,
    p_amount_minor: deposit.amountMinor,
    p_paid_on: deposit.paidOn,
    p_payers: deposit.payers.map((payer) => ({
      user_id: payer.userId,
      amount_minor: payer.amountMinor,
    })),
    p_split_method: deposit.splitMethod,
    p_participants: toRpcParticipants(deposit.participants),
    p_held_by: deposit.heldBy ?? undefined,
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

export async function takeOverDepositShare(input: {
  depositId: string;
  fromId: string;
  toId: string;
  amountMinor: number;
  requestId: string;
}): Promise<void> {
  const { error } = await supabase.rpc('take_over_deposit_share', {
    p_deposit_id: input.depositId,
    p_from_id: input.fromId,
    p_to_id: input.toId,
    p_amount_minor: input.amountMinor,
    p_client_request_id: input.requestId,
  });
  if (error) throw error;
}

export async function refundDepositShare(input: {
  depositId: string;
  userId: string;
  refundedMinor: number;
  deductions: Deduction[];
  requestId: string;
}): Promise<void> {
  const { error } = await supabase.rpc('refund_deposit_share', {
    p_deposit_id: input.depositId,
    p_user_id: input.userId,
    p_refunded_minor: input.refundedMinor,
    p_deductions: toRpcDeductions(input.deductions),
    p_client_request_id: input.requestId,
  });
  if (error) throw error;
}

export async function returnDeposit(input: {
  depositId: string;
  receivedBy: string;
  refundedMinor: number;
  deductions: Deduction[];
  requestId: string;
}): Promise<void> {
  const { error } = await supabase.rpc('return_deposit', {
    p_deposit_id: input.depositId,
    p_received_by: input.receivedBy,
    p_refunded_minor: input.refundedMinor,
    p_deductions: toRpcDeductions(input.deductions),
    p_client_request_id: input.requestId,
  });
  if (error) throw error;
}

export async function undoDepositAction(actionId: string, requestId: string): Promise<void> {
  const { error } = await supabase.rpc('undo_deposit_action', {
    p_action_id: actionId,
    p_client_request_id: requestId,
  });
  if (error) throw error;
}
