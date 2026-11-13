import { storageStatusOf } from '@/lib/errors';
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

const RECEIPTS_BUCKET = 'receipts';
const RECEIPT_URL_LIFETIME_SECONDS = 60 * 60;
export const RECEIPT_URL_STALE_TIME_MS = (RECEIPT_URL_LIFETIME_SECONDS - 5 * 60) * 1000;

/** A photo chosen on the device. `id` is fixed when it is picked, so a retry reuses its path. */
export type PickedReceipt = { id: string; uri: string; mimeType: string };
export type Attachment = Pick<Tables<'expense_attachments'>, 'id' | 'storage_path' | 'created_at'>;

const RECEIPT_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
/** The limits of the receipts bucket, checked again by storage. */
export const RECEIPT_MIME_TYPES = Object.keys(RECEIPT_EXTENSIONS);
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** Where a receipt is stored: the database only accepts files under their apartment and expense. */
export function receiptPathFor(apartmentId: string, expenseId: string, receipt: PickedReceipt) {
  const extension = RECEIPT_EXTENSIONS[receipt.mimeType] ?? 'jpg';
  return `${apartmentId}/${expenseId}/${receipt.id}.${extension}`;
}

/**
 * Uploads a receipt image under the expense's folder and registers it. Safe to
 * retry: a file that already reached storage is not sent again, and
 * registering the same file twice returns the same receipt.
 */
export async function uploadReceipt(
  apartmentId: string,
  expenseId: string,
  receipt: PickedReceipt,
): Promise<void> {
  const path = receiptPathFor(apartmentId, expenseId, receipt);
  const file = await fetch(receipt.uri);
  const body = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, body, { contentType: receipt.mimeType });
  // 409: an earlier attempt uploaded this file but its registration failed.
  if (uploadError && storageStatusOf(uploadError) !== 409) throw uploadError;

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

export async function createReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, RECEIPT_URL_LIFETIME_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}
