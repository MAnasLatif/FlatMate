import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

/** The filters of the timeline; null shows everything. */
export const ACTIVITY_GROUPS = [
  { value: 'expenses', label: 'Expenses' },
  { value: 'disputes', label: 'Disputes' },
  { value: 'payments', label: 'Payments' },
  { value: 'members', label: 'Members' },
  { value: 'settings', label: 'Settings' },
] as const;

export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number]['value'];

export type ActivityFilter = { group: ActivityGroup | null; actorId: string | null };

export const NO_ACTIVITY_FILTER: ActivityFilter = { group: null, actorId: null };

/**
 * One entry of the apartment's timeline (FR-10.8), from the audit trail. The
 * database shows each person only the entries about records they may read.
 */
export type ActivityEntry = {
  id: number;
  createdAt: string;
  /** Null when FlatMate did it on schedule, such as making an expense final. */
  actorId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  details: Json;
  /** The record's name where it has one and still exists: an expense's title. */
  subject: string | null;
  amountMinor: number | null;
  /** Who it is about: who paid, the member, the person asking to join. */
  personId: string | null;
  /** The other person: who was paid, or who is owed. */
  counterpartyId: string | null;
};

export const ACTIVITY_PAGE_SIZE = 30;

/** One page, newest first, continuing before the entry with id `before`. */
export async function fetchActivityPage(
  apartmentId: string,
  filter: ActivityFilter,
  before: number | null,
): Promise<ActivityEntry[]> {
  const { data, error } = await supabase.rpc('get_activity', {
    p_apartment_id: apartmentId,
    p_group: filter.group ?? undefined,
    p_actor_id: filter.actorId ?? undefined,
    p_before: before ?? undefined,
    p_limit: ACTIVITY_PAGE_SIZE,
  });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    actorId: row.actor_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    details: row.details,
    subject: row.subject,
    amountMinor: row.amount_minor,
    personId: row.person_id,
    counterpartyId: row.counterparty_id,
  }));
}
