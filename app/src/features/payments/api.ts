import { imagePath, type PickedImage, uploadPrivateImage } from '@/lib/private-images';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

/** Kept distinct everywhere, as SRS FR-07.8 requires. 'final' means confirmed by app policy. */
export type PaymentStatus = 'provisional' | 'disputed' | 'final' | 'void';

/** A member's record that they paid another outside the app. A claim, never proof of a transfer. */
export type Payment = {
  id: string;
  apartmentId: string;
  payerId: string;
  recipientId: string;
  amountMinor: number;
  currency: string;
  paidAt: string;
  reference: string | null;
  status: PaymentStatus;
  /** When the recipient's window to object closes. */
  finalizeAfter: string;
  finalizedAt: string | null;
  expenseId: string | null;
  createdAt: string;
};

/** The recipient's objection to a payment (decision record 0005). */
export type PaymentObjection = {
  id: string;
  raisedBy: string;
  reason: string;
  isLate: boolean;
  state: 'open' | 'resolved';
  resolution: 'withdrawn' | 'voided' | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type PaymentProof = { id: string; storagePath: string; createdAt: string };

export type PaymentDetail = {
  payment: Payment;
  objections: PaymentObjection[];
  proofs: PaymentProof[];
};

export const PAIR_PAYMENTS_PAGE_SIZE = 20;

const PAYMENT_COLUMNS =
  'id, apartment_id, payer_id, recipient_id, amount_minor, currency, paid_at, reference, status, finalize_after, finalized_at, expense_id, created_at';

type PaymentRow = Omit<Tables<'payments'>, 'client_request_id'>;

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    apartmentId: row.apartment_id,
    payerId: row.payer_id,
    recipientId: row.recipient_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    paidAt: row.paid_at,
    reference: row.reference,
    status: row.status as PaymentStatus,
    finalizeAfter: row.finalize_after,
    finalizedAt: row.finalized_at,
    expenseId: row.expense_id,
    createdAt: row.created_at,
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Payments either way between the signed-in user and one person, newest first. */
export async function fetchPairPaymentsPage(
  apartmentId: string,
  userId: string,
  counterpartyId: string,
  page: number,
): Promise<Payment[]> {
  // The ids go into a filter string, and the counterparty comes from a link, so check them first.
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(counterpartyId)) {
    throw new Error('A member id is not valid.');
  }
  const from = page * PAIR_PAYMENTS_PAGE_SIZE;
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('apartment_id', apartmentId)
    .or(
      `and(payer_id.eq.${userId},recipient_id.eq.${counterpartyId}),and(payer_id.eq.${counterpartyId},recipient_id.eq.${userId})`,
    )
    .order('created_at', { ascending: false })
    .range(from, from + PAIR_PAYMENTS_PAGE_SIZE - 1);
  if (error) throw error;
  return data.map(toPayment);
}

/** A payment with its objections and proof, or null when the user cannot see it. */
export async function fetchPaymentDetail(paymentId: string): Promise<PaymentDetail | null> {
  const [paymentResult, objectionsResult, proofsResult] = await Promise.all([
    supabase.from('payments').select(PAYMENT_COLUMNS).eq('id', paymentId).maybeSingle(),
    supabase
      .from('payment_disputes')
      .select('id, raised_by, reason, is_late, state, resolution, created_at, resolved_at')
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: true }),
    supabase
      .from('payment_attachments')
      .select('id, storage_path, created_at')
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: true }),
  ]);
  if (paymentResult.error) throw paymentResult.error;
  if (objectionsResult.error) throw objectionsResult.error;
  if (proofsResult.error) throw proofsResult.error;
  if (!paymentResult.data) return null;

  return {
    payment: toPayment(paymentResult.data),
    objections: objectionsResult.data.map((row) => ({
      id: row.id,
      raisedBy: row.raised_by,
      reason: row.reason,
      isLate: row.is_late,
      state: row.state as PaymentObjection['state'],
      resolution: row.resolution as PaymentObjection['resolution'],
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    })),
    proofs: proofsResult.data.map((row) => ({
      id: row.id,
      storagePath: row.storage_path,
      createdAt: row.created_at,
    })),
  };
}

export type RecordPaymentInput = {
  apartmentId: string;
  recipientId: string;
  amountMinor: number;
  /** ISO time the payer says they paid, or null for now. */
  paidAt: string | null;
  reference: string | null;
  expenseId: string | null;
  /** One id per payment being recorded, so a retry cannot record two. */
  requestId: string;
};

export async function recordPayment(input: RecordPaymentInput): Promise<string> {
  const { data, error } = await supabase.rpc('record_payment', {
    p_apartment_id: input.apartmentId,
    p_recipient_id: input.recipientId,
    p_amount_minor: input.amountMinor,
    p_paid_at: input.paidAt ?? undefined,
    p_reference: input.reference ?? undefined,
    p_expense_id: input.expenseId ?? undefined,
    p_client_request_id: input.requestId,
  });
  if (error) throw error;
  return data;
}

/** Offsets what the two owe each other; the net between them does not change. */
export async function netOff(
  apartmentId: string,
  counterpartyId: string,
  amountMinor: number,
  requestId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('net_off', {
    p_apartment_id: apartmentId,
    p_counterparty_id: counterpartyId,
    p_amount_minor: amountMinor,
    p_client_request_id: requestId,
  });
  if (error) throw error;
  return data;
}

/** Uploads a photo under the payment's folder and registers it as proof. Safe to retry. */
export async function addPaymentProof(
  apartmentId: string,
  paymentId: string,
  image: PickedImage,
): Promise<void> {
  const path = imagePath(`${apartmentId}/${paymentId}`, image);
  await uploadPrivateImage('payment-proofs', path, image);
  const { error } = await supabase.rpc('add_payment_proof', {
    p_payment_id: paymentId,
    p_storage_path: path,
  });
  if (error) throw error;
}

export async function declinePayment(paymentId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('decline_payment', {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function withdrawPaymentDecline(objectionId: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_payment_decline', { p_dispute_id: objectionId });
  if (error) throw error;
}

export async function voidPayment(paymentId: string): Promise<void> {
  const { error } = await supabase.rpc('void_payment', { p_payment_id: paymentId });
  if (error) throw error;
}
