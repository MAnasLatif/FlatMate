import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

import type { ReminderSchedule } from './reminders';

export type Apartment = Tables<'apartments'>;
export type MemberRole = 'admin' | 'member';

export type ApartmentSummary = Pick<
  Apartment,
  'id' | 'name' | 'location' | 'show_location' | 'currency'
>;

export type MyApartment = {
  role: MemberRole;
  canAddExpense: boolean;
  apartment: ApartmentSummary;
};

export type Member = {
  membershipId: string;
  userId: string;
  role: MemberRole;
  canAddExpense: boolean;
  joinedAt: string;
  leftAt: string | null;
  leftReason: 'left' | 'removed' | null;
  /** Set when an admin removed this former member from the list. Their records stay. */
  hiddenAt: string | null;
  displayName: string | null;
  avatarPath: string | null;
};

export type Category = Pick<Tables<'expense_categories'>, 'id' | 'name'>;

const roleSchema = z.enum(['admin', 'member']);

/** The apartments the user currently belongs to, oldest membership first. */
export async function fetchMyApartments(userId: string): Promise<MyApartment[]> {
  const { data, error } = await supabase
    .from('apartment_members')
    .select(
      'role, can_add_expense, apartment:apartments!inner(id, name, location, show_location, currency)',
    )
    .eq('user_id', userId)
    .is('left_at', null)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    role: roleSchema.parse(row.role),
    canAddExpense: row.can_add_expense,
    apartment: row.apartment,
  }));
}

export async function fetchApartment(apartmentId: string): Promise<Apartment> {
  const { data, error } = await supabase
    .from('apartments')
    .select('*')
    .eq('id', apartmentId)
    .single();
  if (error) throw error;
  return data;
}

/** Everyone who belongs or belonged to the apartment, in the order they joined. */
export async function fetchMembers(apartmentId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('apartment_members')
    .select(
      'id, user_id, role, can_add_expense, joined_at, left_at, left_reason, hidden_at, profile:profiles(display_name, avatar_path)',
    )
    .eq('apartment_id', apartmentId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return data.map((row) => ({
    membershipId: row.id,
    userId: row.user_id,
    role: roleSchema.parse(row.role),
    canAddExpense: row.can_add_expense,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    leftReason:
      row.left_reason === 'left' || row.left_reason === 'removed' ? row.left_reason : null,
    hiddenAt: row.hidden_at,
    displayName: row.profile?.display_name ?? null,
    avatarPath: row.profile?.avatar_path ?? null,
  }));
}

export type CreateApartmentInput = {
  name: string;
  location: string | null;
  currency: string;
  timezone: string;
  settlementDay: number;
  approvalDays: number;
};

export async function createApartment(input: CreateApartmentInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_apartment', {
    p_name: input.name,
    p_location: input.location ?? undefined,
    // A location, when given, is shown to members (no separate switch).
    p_show_location: input.location !== null,
    p_currency: input.currency,
    p_timezone: input.timezone,
    p_settlement_day: input.settlementDay,
    p_approval_days: input.approvalDays,
  });
  if (error) throw error;
  return data;
}

const joinResultSchema = z.discriminatedUnion('status', [
  // Joining needs an admin's approval: a new request, or one already waiting.
  z.object({
    status: z.literal('requested'),
    request_id: z.uuid(),
    apartment_id: z.uuid(),
    apartment_name: z.string(),
  }),
  z.object({
    status: z.literal('pending'),
    request_id: z.uuid(),
    apartment_id: z.uuid(),
    apartment_name: z.string(),
  }),
  // Kept for an older server that still joined straight away.
  z.object({ status: z.literal('joined'), apartment_id: z.uuid() }),
  z.object({ status: z.literal('already_member'), apartment_id: z.uuid() }),
  z.object({ status: z.literal('invalid_code') }),
  z.object({ status: z.literal('rate_limited') }),
]);

export type JoinResult = z.infer<typeof joinResultSchema>;

export async function joinApartment(code: string): Promise<JoinResult> {
  const { data, error } = await supabase.rpc('join_apartment', { p_code: code });
  if (error) throw error;
  return joinResultSchema.parse(data);
}

/** A request the signed-in user made to join an apartment, still waiting. */
export type MyJoinRequest = {
  id: string;
  apartmentId: string;
  apartmentName: string;
  createdAt: string;
};

export async function fetchMyJoinRequests(): Promise<MyJoinRequest[]> {
  const { data, error } = await supabase.rpc('get_my_join_requests');
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    apartmentId: row.apartment_id,
    apartmentName: row.apartment_name,
    createdAt: row.created_at,
  }));
}

export async function cancelJoinRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_join_request', { p_request_id: requestId });
  if (error) throw error;
}

/** Someone asking to join an apartment, for its admins. */
export type JoinRequest = {
  id: string;
  userId: string;
  displayName: string | null;
  avatarPath: string | null;
  createdAt: string;
};

export async function fetchJoinRequests(apartmentId: string): Promise<JoinRequest[]> {
  const { data, error } = await supabase.rpc('get_join_requests', { p_apartment_id: apartmentId });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    createdAt: row.created_at,
  }));
}

export async function decideJoinRequest(requestId: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc(approve ? 'approve_join_request' : 'decline_join_request', {
    p_request_id: requestId,
  });
  if (error) throw error;
}

export type ApartmentSettingsInput = Omit<CreateApartmentInput, 'currency'>;

export async function updateApartmentSettings(
  apartmentId: string,
  input: ApartmentSettingsInput,
): Promise<void> {
  const { error } = await supabase.rpc('update_apartment_settings', {
    p_apartment_id: apartmentId,
    p_name: input.name,
    p_location: input.location ?? '',
    p_show_location: input.location !== null,
    p_timezone: input.timezone,
    p_settlement_day: input.settlementDay,
    p_approval_days: input.approvalDays,
  });
  if (error) throw error;
}

/** Sets how far ahead the apartment's reminders go out. Admins only; the server checks. */
export async function updateApartmentReminders(
  apartmentId: string,
  schedule: ReminderSchedule,
): Promise<void> {
  const { error } = await supabase.rpc('update_apartment_reminders', {
    p_apartment_id: apartmentId,
    // Left out, a reminder is turned off.
    p_due_reminder_days: schedule.dueReminderDays ?? undefined,
    p_settlement_reminder_days: schedule.settlementReminderDays ?? undefined,
  });
  if (error) throw error;
}

export async function setMemberRole(
  apartmentId: string,
  userId: string,
  role: MemberRole,
): Promise<void> {
  const { error } = await supabase.rpc('set_member_role', {
    p_apartment_id: apartmentId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
}

export async function setMemberCanAddExpense(
  apartmentId: string,
  userId: string,
  allowed: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('set_member_can_add_expense', {
    p_apartment_id: apartmentId,
    p_user_id: userId,
    p_allowed: allowed,
  });
  if (error) throw error;
}

export async function removeMember(apartmentId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_member', {
    p_apartment_id: apartmentId,
    p_user_id: userId,
  });
  if (error) throw error;
}

/** Hides a former member from the apartment's list. Their records and balances stay. */
export async function hideFormerMember(apartmentId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('hide_former_member', {
    p_apartment_id: apartmentId,
    p_user_id: userId,
  });
  if (error) throw error;
}

/** Invites a former member back. Asking again while one waits returns that one. */
export async function inviteBack(apartmentId: string, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('invite_back', {
    p_apartment_id: apartmentId,
    p_user_id: userId,
  });
  if (error) throw error;
  return data;
}

export async function cancelRejoinInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_rejoin_invite', { p_invite_id: inviteId });
  if (error) throw error;
}

/** An invitation waiting for a former member's answer, for the apartment's admins. */
export type RejoinInvite = { id: string; userId: string; createdAt: string };

export async function fetchRejoinInvites(apartmentId: string): Promise<RejoinInvite[]> {
  const { data, error } = await supabase.rpc('get_rejoin_invites', {
    p_apartment_id: apartmentId,
  });
  if (error) throw error;
  return data.map((row) => ({ id: row.id, userId: row.user_id, createdAt: row.created_at }));
}

/** An invitation to the signed-in user to rejoin an apartment they left. */
export type MyRejoinInvite = {
  id: string;
  apartmentId: string;
  apartmentName: string;
  invitedByName: string | null;
  createdAt: string;
};

export async function fetchMyRejoinInvites(): Promise<MyRejoinInvite[]> {
  const { data, error } = await supabase.rpc('get_my_rejoin_invites');
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    apartmentId: row.apartment_id,
    apartmentName: row.apartment_name,
    invitedByName: row.invited_by_name,
    createdAt: row.created_at,
  }));
}

/** Accepts or declines an invitation. Answers with the apartment, which accepting joins. */
export async function answerRejoinInvite(inviteId: string, accept: boolean): Promise<string> {
  const { data, error } = await supabase.rpc(
    accept ? 'accept_rejoin_invite' : 'decline_rejoin_invite',
    { p_invite_id: inviteId },
  );
  if (error) throw error;
  return data;
}

export async function leaveApartment(apartmentId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_apartment', { p_apartment_id: apartmentId });
  if (error) throw error;
}

/**
 * The apartment's one join code, as XXXX-XXXX. It does not expire; the
 * database makes it the first time an admin asks. Admins only.
 */
export async function fetchJoinCode(apartmentId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_join_code', { p_apartment_id: apartmentId });
  if (error) throw error;
  return data;
}

/** Replaces the apartment's join code; every older code stops working. */
export async function changeJoinCode(apartmentId: string): Promise<string> {
  const { data, error } = await supabase.rpc('change_join_code', { p_apartment_id: apartmentId });
  if (error) throw error;
  return data;
}

/**
 * Emails a join code to `email` through the send-invite-email Edge Function.
 * Fails with an Error whose message is the function's error key, such as
 * `rate_limited`, or `unreachable` when the function could not be reached.
 */
export async function sendInviteEmail(apartmentId: string, email: string): Promise<void> {
  const { error } = await supabase.functions.invoke('send-invite-email', {
    body: { apartmentId, email },
  });
  if (!error) return;
  if (error instanceof FunctionsHttpError) {
    const body: unknown = await (error.context as Response).json().catch(() => null);
    const key =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'unknown';
    throw new Error(key);
  }
  if (error instanceof FunctionsFetchError) throw new Error('unreachable');
  throw error;
}

export async function fetchCategories(apartmentId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('id, name')
    .eq('apartment_id', apartmentId)
    .is('archived_at', null)
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addCategory(apartmentId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('add_category', {
    p_apartment_id: apartmentId,
    p_name: name,
  });
  if (error) throw error;
}

export async function renameCategory(categoryId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('rename_category', {
    p_category_id: categoryId,
    p_name: name,
  });
  if (error) throw error;
}

export async function archiveCategory(categoryId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_category', { p_category_id: categoryId });
  if (error) throw error;
}
