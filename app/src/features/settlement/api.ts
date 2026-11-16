import { supabase } from '@/lib/supabase';

export type Period = { id: string; startsOn: string; endsOn: string };

/** What the user and one person owe each other in the open period (SRS FR-08.3). */
export type PreviewRow = {
  counterpartyId: string;
  /** What the user owes them that is payable: final and provisional. */
  oweMinor: number;
  /** What they owe the user that is payable. */
  owedMinor: number;
  /** Held by open disputes, not payable yet. */
  heldOweMinor: number;
  heldOwedMinor: number;
};

export type SettlementPreview = { period: Period | null; rows: PreviewRow[] };

/** An expense behind what two people owe each other, and how much payments and offsets cover. */
export type Obligation = {
  expenseId: string;
  title: string;
  expenseDate: string;
  /** 'owe': the user owes the other person; 'owed': the other way round. */
  direction: 'owe' | 'owed';
  amountMinor: number;
  coveredMinor: number;
  isHeld: boolean;
};

/** A pair's balance when a period closed. Positive: memberA owed memberB. */
export type ClosingBalance = {
  memberA: string;
  memberB: string;
  finalMinor: number;
  provisionalMinor: number;
  disputedMinor: number;
};

export type ClosedPeriod = Period & {
  closedAt: string;
  openDisputeCount: number;
  /** The pairs the user may see: their own, or every pair for an admin. */
  balances: ClosingBalance[];
};

export const CLOSED_PERIODS_PAGE_SIZE = 6;

export async function fetchSettlementPreview(apartmentId: string): Promise<SettlementPreview> {
  const [previewResult, periodResult] = await Promise.all([
    supabase.rpc('get_settlement_preview', { p_apartment_id: apartmentId }),
    supabase
      .from('settlement_periods')
      .select('id, starts_on, ends_on')
      .eq('apartment_id', apartmentId)
      .eq('state', 'open')
      .maybeSingle(),
  ]);
  if (previewResult.error) throw previewResult.error;
  if (periodResult.error) throw periodResult.error;
  const period = periodResult.data
    ? {
        id: periodResult.data.id,
        startsOn: periodResult.data.starts_on,
        endsOn: periodResult.data.ends_on,
      }
    : null;
  return {
    period,
    rows: previewResult.data.map((row) => ({
      counterpartyId: row.counterparty_id,
      oweMinor: row.owe_minor,
      owedMinor: row.owed_minor,
      heldOweMinor: row.held_owe_minor,
      heldOwedMinor: row.held_owed_minor,
    })),
  };
}

export async function fetchPairObligations(
  apartmentId: string,
  counterpartyId: string,
): Promise<Obligation[]> {
  const { data, error } = await supabase.rpc('get_my_pair_obligations', {
    p_apartment_id: apartmentId,
    p_counterparty_id: counterpartyId,
  });
  if (error) throw error;
  return data.map((row) => ({
    expenseId: row.expense_id,
    title: row.title,
    expenseDate: row.expense_date,
    direction: row.direction as Obligation['direction'],
    amountMinor: row.amount_minor,
    coveredMinor: row.covered_minor,
    isHeld: row.is_held,
  }));
}

/** Closed periods, newest first, with the closing balances the user may see. */
export async function fetchClosedPeriodsPage(
  apartmentId: string,
  page: number,
): Promise<ClosedPeriod[]> {
  const from = page * CLOSED_PERIODS_PAGE_SIZE;
  const { data, error } = await supabase
    .from('settlement_periods')
    .select(
      'id, starts_on, ends_on, closed_at, open_dispute_count, balances:settlement_balances(member_a, member_b, final_minor, provisional_minor, disputed_minor)',
    )
    .eq('apartment_id', apartmentId)
    .eq('state', 'closed')
    .order('starts_on', { ascending: false })
    .range(from, from + CLOSED_PERIODS_PAGE_SIZE - 1);
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    // Closed periods always have both (settlement_periods_closed_valid).
    closedAt: row.closed_at as string,
    openDisputeCount: row.open_dispute_count as number,
    balances: row.balances.map((balance) => ({
      memberA: balance.member_a,
      memberB: balance.member_b,
      finalMinor: balance.final_minor,
      provisionalMinor: balance.provisional_minor,
      disputedMinor: balance.disputed_minor,
    })),
  }));
}

/** A time the user left or was removed from an apartment, with what they owed each person then. */
export type MyExit = {
  id: string;
  apartmentId: string;
  apartmentName: string;
  currency: string;
  reason: 'left' | 'removed';
  exitedAt: string;
  /** Positive: the user owed the counterparty when they left. */
  balances: { counterpartyId: string; payableMinor: number; heldMinor: number }[];
};

export const MY_EXITS_LIMIT = 20;

/** The user's most recent exits, newest first. */
export async function fetchMyExits(userId: string): Promise<MyExit[]> {
  const { data, error } = await supabase
    .from('member_exits')
    .select(
      'id, apartment_id, reason, exited_at, apartment:apartments!inner(name, currency), balances:member_exit_balances(counterparty_id, final_minor, provisional_minor, disputed_minor)',
    )
    .eq('user_id', userId)
    .order('exited_at', { ascending: false })
    .limit(MY_EXITS_LIMIT);
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    apartmentId: row.apartment_id,
    apartmentName: row.apartment.name,
    currency: row.apartment.currency,
    reason: row.reason as MyExit['reason'],
    exitedAt: row.exited_at,
    balances: row.balances.map((balance) => ({
      counterpartyId: balance.counterparty_id,
      payableMinor: balance.final_minor + balance.provisional_minor,
      heldMinor: balance.disputed_minor,
    })),
  }));
}
