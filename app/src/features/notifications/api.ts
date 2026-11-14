import { supabase } from '@/lib/supabase';

/** Where opening a notification goes; the screen there checks access again (FR-09.3). */
export type NotificationRecordType =
  | 'expense'
  | 'dispute'
  | 'payment'
  | 'ledger'
  | 'members'
  | 'settlement'
  | 'apartment'
  | 'join_request';

export type NotificationItem = {
  id: string;
  apartmentId: string;
  /** Null when the apartment can no longer be seen. */
  apartmentName: string | null;
  /** What happened, such as 'expense.created'. */
  type: string;
  recordType: NotificationRecordType;
  recordId: string | null;
  /** Null when the person who acted can no longer be seen, or it was the app itself. */
  actorName: string | null;
  createdAt: string;
  readAt: string | null;
};

export const NOTIFICATIONS_PAGE_SIZE = 30;

const COLUMNS =
  'id, apartment_id, type, record_type, record_id, created_at, read_at, apartment:apartments(name), actor:profiles!notifications_actor_id_fkey(display_name)';

type Row = {
  id: string;
  apartment_id: string;
  type: string;
  record_type: string;
  record_id: string | null;
  created_at: string;
  read_at: string | null;
  apartment: { name: string } | null;
  actor: { display_name: string | null } | null;
};

function toItem(row: Row): NotificationItem {
  return {
    id: row.id,
    apartmentId: row.apartment_id,
    apartmentName: row.apartment?.name ?? null,
    type: row.type,
    recordType: row.record_type as NotificationRecordType,
    recordId: row.record_id,
    actorName: row.actor?.display_name ?? null,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

/** One page of the signed-in user's notifications, newest first. RLS returns only theirs. */
export async function fetchNotificationsPage(page: number): Promise<NotificationItem[]> {
  const from = page * NOTIFICATIONS_PAGE_SIZE;
  const { data, error } = await supabase
    .from('notifications')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + NOTIFICATIONS_PAGE_SIZE - 1);
  if (error) throw error;
  return data.map(toItem);
}

/** One notification, or null when it is not the user's or no longer exists. */
export async function fetchNotification(id: string): Promise<NotificationItem | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toItem(data) : null;
}

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

/** Marks the given notifications read, or all of them. */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const { error } = await supabase.rpc('mark_notifications_read', ids ? { p_ids: ids } : {});
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
