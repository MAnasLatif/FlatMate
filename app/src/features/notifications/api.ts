import { supabase } from '@/lib/supabase';

import { placeUnread, type UnreadNotification } from './unread';

/** Where opening a notification goes; the screen there checks access again (FR-09.3). */
export type NotificationRecordType =
  | 'expense'
  | 'dispute'
  | 'payment'
  | 'ledger'
  | 'members'
  | 'settlement'
  | 'apartment'
  | 'join_request'
  | 'rejoin_invite';

/** What a notification is about: enough to open it, and nothing that names anyone. */
export type NotificationTarget = {
  id: string;
  apartmentId: string;
  recordType: NotificationRecordType;
  recordId: string | null;
};

/**
 * The most unread notifications loaded at once. Someone who stays away long
 * enough to pass it sees the newest ones marked; the rest stay unread.
 */
export const UNREAD_LIMIT = 500;

const TARGET_COLUMNS = 'id, apartment_id, record_type, record_id';

type TargetRow = {
  id: string;
  apartment_id: string;
  record_type: string;
  record_id: string | null;
};

function toTarget(row: TargetRow): NotificationTarget {
  return {
    id: row.id,
    apartmentId: row.apartment_id,
    recordType: row.record_type as NotificationRecordType,
    recordId: row.record_id,
  };
}

/** One notification, or null when it is not the user's or no longer exists. */
export async function fetchNotificationTarget(id: string): Promise<NotificationTarget | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select(TARGET_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toTarget(data) : null;
}

/**
 * The signed-in user's unread notifications, newest first, each with what is
 * needed to mark it where it shows: the expense a dispute is about, and the
 * other person in a payment. RLS returns only the user's own notifications,
 * and only the disputes and payments they may see.
 */
export async function fetchUnreadNotifications(userId: string): Promise<UnreadNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(TARGET_COLUMNS)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(UNREAD_LIMIT);
  if (error) throw error;
  const targets = data.map(toTarget);

  const idsOf = (type: NotificationRecordType) => [
    ...new Set(
      targets.flatMap((item) => (item.recordType === type && item.recordId ? [item.recordId] : [])),
    ),
  ];
  const disputeIds = idsOf('dispute');
  const paymentIds = idsOf('payment');
  const [disputes, payments] = await Promise.all([
    disputeIds.length > 0
      ? supabase.from('disputes').select('id, expense_id').in('id', disputeIds)
      : null,
    paymentIds.length > 0
      ? supabase.from('payments').select('id, payer_id, recipient_id').in('id', paymentIds)
      : null,
  ]);
  if (disputes?.error) throw disputes.error;
  if (payments?.error) throw payments.error;

  return placeUnread(targets, {
    userId,
    disputes: (disputes?.data ?? []).map((row) => ({ id: row.id, expenseId: row.expense_id })),
    payments: (payments?.data ?? []).map((row) => ({
      id: row.id,
      payerId: row.payer_id,
      recipientId: row.recipient_id,
    })),
  });
}

/** Marks the given notifications read. */
export async function markNotificationsRead(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids });
  if (error) throw error;
}

export async function registerPushToken(token: string, platform: 'android' | 'ios') {
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: platform,
  });
  if (error) throw error;
}

export async function unregisterPushToken(token: string) {
  const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
  if (error) throw error;
}
