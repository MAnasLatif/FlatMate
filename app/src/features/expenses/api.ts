import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

import type { ValidExpense } from './draft';

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
    p_participants: expense.participants.map((participant) => ({
      user_id: participant.userId,
      ...(participant.basisPoints !== undefined ? { basis_points: participant.basisPoints } : {}),
      ...(participant.amountMinor !== undefined ? { amount_minor: participant.amountMinor } : {}),
    })),
    p_payers: expense.payers.map((payer) => ({
      user_id: payer.userId,
      amount_minor: payer.amountMinor,
    })),
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
