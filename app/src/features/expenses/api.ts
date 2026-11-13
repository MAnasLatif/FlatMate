import { imagePath, type PickedImage, uploadPrivateImage } from '@/lib/private-images';
import { supabase } from '@/lib/supabase';
import type { Json, Tables } from '@/types/database';

import type { ValidExpense } from './draft';
import type { Contribution, SplitMethod } from './split';

export type ExpenseStatus = 'provisional' | 'disputed' | 'final' | 'void';

export type ExpenseListItem = Pick<
  Tables<'expenses'>,
  | 'id'
  | 'title'
  | 'amount_minor'
  | 'currency'
  | 'expense_date'
  | 'due_date'
  | 'status'
  | 'paid_status'
  | 'created_at'
> & { category: { name: string } | null };

export type Balance = {
  counterpartyId: string;
  /** Positive: the signed-in user owes this person. Negative: they owe the user. */
  finalMinor: number;
  provisionalMinor: number;
  disputedMinor: number;
};

export const EXPENSES_PAGE_SIZE = 20;

/** Amounts by state. Final and provisional are payable; disputed amounts are held. */
export type StateAmounts = { finalMinor: number; provisionalMinor: number; disputedMinor: number };

/** What the signed-in user owes one person and what that person owes them, gross. */
export type PairBalance = { counterpartyId: string; owe: StateAmounts; owed: StateAmounts };

/** An expense between the signed-in user and one person, with what it adds each way. */
export type PairExpense = {
  expenseId: string;
  title: string;
  expenseDate: string;
  currency: string;
  status: ExpenseStatus;
  paidStatus: 'paid' | 'unpaid';
  /** What it makes the user owe them, after any reversals. */
  oweMinor: number;
  /** What it makes them owe the user, after any reversals. */
  owedMinor: number;
};

export const PAIR_EXPENSES_PAGE_SIZE = 20;

/** One entry in an expense's history, from the apartment's audit trail. */
export type HistoryEvent = {
  id: number;
  actorId: string | null;
  action: string;
  details: Json;
  createdAt: string;
};

/** Everything the expense detail screen shows, as of the expense's current revision. */
export type ExpenseDetail = {
  id: string;
  apartmentId: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  amountMinor: number;
  currency: string;
  expenseDate: string;
  dueDate: string | null;
  paidStatus: 'paid' | 'unpaid';
  status: ExpenseStatus;
  revision: number;
  /** When the objection window closes, if no dispute is opened. */
  finalizeAfter: string;
  finalizedAt: string | null;
  createdBy: string;
  createdAt: string;
  splitMethod: SplitMethod;
  splits: { userId: string; amountMinor: number; basisPoints: number | null }[];
  /** Empty while a bill is unpaid. */
  payers: Contribution[];
  history: HistoryEvent[];
};

/** The most history entries shown for one expense. */
export const EXPENSE_HISTORY_LIMIT = 50;

export async function postExpense(
  apartmentId: string,
  expense: ValidExpense,
  requestId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('post_expense', {
    p_apartment_id: apartmentId,
    p_title: expense.title,
    p_amount_minor: expense.amountMinor,
    p_expense_date: expense.expenseDate,
    p_split_method: expense.splitMethod,
    p_participants: toRpcParticipants(expense),
    p_payers: toRpcPayers(expense.payers),
    p_category_id: expense.categoryId ?? undefined,
    p_description: expense.description ?? undefined,
    p_due_date: expense.dueDate ?? undefined,
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

/** One page of the expenses dated in the month starting on monthStartDate, newest first. */
export async function fetchExpensesPage(
  apartmentId: string,
  monthStartDate: string,
  nextMonthStartDate: string,
  page: number,
): Promise<ExpenseListItem[]> {
  const from = page * EXPENSES_PAGE_SIZE;
  const { data, error } = await supabase
    .from('expenses')
    .select(
      'id, title, amount_minor, currency, expense_date, due_date, status, paid_status, created_at, category:expense_categories(name)',
    )
    .eq('apartment_id', apartmentId)
    .gte('expense_date', monthStartDate)
    .lt('expense_date', nextMonthStartDate)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + EXPENSES_PAGE_SIZE - 1);
  if (error) throw error;
  return data;
}

/**
 * Loads an expense with its current split and payers, or null when the user
 * cannot see it. The revisions are embedded in the same request, so the split
 * and payers always match the expense row even while someone records a payment.
 */
export async function fetchExpenseDetail(expenseId: string): Promise<ExpenseDetail | null> {
  const [expenseResult, historyResult] = await Promise.all([
    supabase
      .from('expenses')
      .select(
        `id, apartment_id, title, description, category_id, amount_minor, currency, expense_date, due_date,
         paid_status, status, revision, finalize_after, finalized_at, created_by, created_at,
         category:expense_categories(name),
         revisions:expense_revisions(revision, split_method,
           splits:expense_splits(user_id, amount_minor, basis_points),
           payers:expense_payers(user_id, amount_minor))`,
      )
      .eq('id', expenseId)
      .maybeSingle(),
    supabase
      .from('audit_events')
      .select('id, actor_id, action, details, created_at')
      .eq('entity_type', 'expense')
      .eq('entity_id', expenseId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(EXPENSE_HISTORY_LIMIT),
  ]);
  if (expenseResult.error) throw expenseResult.error;
  if (historyResult.error) throw historyResult.error;
  const row = expenseResult.data;
  if (!row) return null;

  const current = row.revisions.find((revision) => revision.revision === row.revision);
  if (!current) throw new Error(`Expense ${row.id} has no revision ${row.revision}.`);

  return {
    id: row.id,
    apartmentId: row.apartment_id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category?.name ?? null,
    amountMinor: row.amount_minor,
    currency: row.currency,
    expenseDate: row.expense_date,
    dueDate: row.due_date,
    paidStatus: row.paid_status as ExpenseDetail['paidStatus'],
    status: row.status as ExpenseStatus,
    revision: row.revision,
    finalizeAfter: row.finalize_after,
    finalizedAt: row.finalized_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    splitMethod: current.split_method as SplitMethod,
    splits: current.splits
      .map((split) => ({
        userId: split.user_id,
        amountMinor: split.amount_minor,
        basisPoints: split.basis_points,
      }))
      .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)),
    payers: current.payers
      .map((payer) => ({ userId: payer.user_id, amountMinor: payer.amount_minor }))
      .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)),
    history: historyResult.data.map((event) => ({
      id: event.id,
      actorId: event.actor_id,
      action: event.action,
      details: event.details,
      createdAt: event.created_at,
    })),
  };
}

/** Records who paid a bill that was added as unpaid. Its debts start from this payment. */
export async function recordBillPayment(expenseId: string, payers: Contribution[]): Promise<void> {
  const { error } = await supabase.rpc('record_bill_payment', {
    p_expense_id: expenseId,
    p_payers: toRpcPayers(payers),
  });
  if (error) throw error;
}

/**
 * Saves an edited expense. The server keeps descriptive changes on the expense
 * and turns money changes into a new revision. `expectedRevision` is the
 * revision the edit was based on, so a stale edit is refused rather than
 * undoing someone else's.
 */
export async function editExpense(
  expenseId: string,
  expectedRevision: number,
  expense: ValidExpense,
  reason: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('edit_expense', {
    p_expense_id: expenseId,
    p_expected_revision: expectedRevision,
    p_title: expense.title,
    // The function takes the whole expense; null clears an optional field.
    p_category_id: expense.categoryId as string,
    p_description: expense.description as string,
    p_expense_date: expense.expenseDate,
    p_due_date: expense.dueDate as string,
    p_amount_minor: expense.amountMinor,
    p_split_method: expense.splitMethod,
    p_participants: toRpcParticipants(expense),
    p_payers: toRpcPayers(expense.payers),
    p_reason: reason ?? undefined,
  });
  if (error) throw error;
}

/** Cancels an expense: it stops counting toward balances but stays in the history. */
export async function voidExpense(expenseId: string): Promise<void> {
  const { error } = await supabase.rpc('void_expense', { p_expense_id: expenseId });
  if (error) throw error;
}

function toRpcParticipants(expense: Pick<ValidExpense, 'participants'>) {
  return expense.participants.map((participant) => ({
    user_id: participant.userId,
    ...(participant.basisPoints !== undefined ? { basis_points: participant.basisPoints } : {}),
    ...(participant.amountMinor !== undefined ? { amount_minor: participant.amountMinor } : {}),
  }));
}

function toRpcPayers(payers: readonly Contribution[]) {
  return payers.map((payer) => ({ user_id: payer.userId, amount_minor: payer.amountMinor }));
}

export async function fetchMyBalances(apartmentId: string): Promise<Balance[]> {
  const { data, error } = await supabase.rpc('get_my_balances', { p_apartment_id: apartmentId });
  if (error) throw error;
  return data.map((row) => ({
    counterpartyId: row.counterparty_id,
    finalMinor: row.final_minor,
    provisionalMinor: row.provisional_minor,
    disputedMinor: row.disputed_minor,
  }));
}

export async function fetchPairBalances(apartmentId: string): Promise<PairBalance[]> {
  const { data, error } = await supabase.rpc('get_my_pair_balances', {
    p_apartment_id: apartmentId,
  });
  if (error) throw error;
  return data.map((row) => ({
    counterpartyId: row.counterparty_id,
    owe: {
      finalMinor: row.owe_final_minor,
      provisionalMinor: row.owe_provisional_minor,
      disputedMinor: row.owe_disputed_minor,
    },
    owed: {
      finalMinor: row.owed_final_minor,
      provisionalMinor: row.owed_provisional_minor,
      disputedMinor: row.owed_disputed_minor,
    },
  }));
}

export async function fetchPairExpensesPage(
  apartmentId: string,
  counterpartyId: string,
  page: number,
): Promise<PairExpense[]> {
  const { data, error } = await supabase.rpc('get_my_pair_expenses', {
    p_apartment_id: apartmentId,
    p_counterparty_id: counterpartyId,
    p_limit: PAIR_EXPENSES_PAGE_SIZE,
    p_offset: page * PAIR_EXPENSES_PAGE_SIZE,
  });
  if (error) throw error;
  return data.map((row) => ({
    expenseId: row.expense_id,
    title: row.title,
    expenseDate: row.expense_date,
    currency: row.currency,
    status: row.status as ExpenseStatus,
    paidStatus: row.paid_status as PairExpense['paidStatus'],
    oweMinor: row.owe_minor,
    owedMinor: row.owed_minor,
  }));
}

export async function fetchMyMonthlyShare(
  apartmentId: string,
  monthStartDate: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('get_my_monthly_share', {
    p_apartment_id: apartmentId,
    p_month: monthStartDate,
  });
  if (error) throw error;
  return data;
}

export type Attachment = Pick<Tables<'expense_attachments'>, 'id' | 'storage_path' | 'created_at'>;

/** Where a receipt is stored: the database only accepts files under their apartment and expense. */
export function receiptPathFor(apartmentId: string, expenseId: string, receipt: PickedImage) {
  return imagePath(`${apartmentId}/${expenseId}`, receipt);
}

/**
 * Uploads a receipt under the expense's folder and registers it. Safe to
 * retry: a file that already reached storage is not sent again, and
 * registering the same file twice returns the same receipt.
 */
export async function uploadReceipt(
  apartmentId: string,
  expenseId: string,
  receipt: PickedImage,
): Promise<void> {
  const path = receiptPathFor(apartmentId, expenseId, receipt);
  await uploadPrivateImage('receipts', path, receipt);
  const { error } = await supabase.rpc('add_expense_attachment', {
    p_expense_id: expenseId,
    p_storage_path: path,
  });
  if (error) throw error;
}

export async function fetchAttachments(expenseId: string): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from('expense_attachments')
    .select('id, storage_path, created_at')
    .eq('expense_id', expenseId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}
