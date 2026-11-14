import { z } from 'zod';

import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

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
  displayName: string | null;
  avatarPath: string | null;
};

export type Invite = Pick<
  Tables<'apartment_invites'>,
  'id' | 'created_at' | 'expires_at' | 'created_by'
>;

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
      'id, user_id, role, can_add_expense, joined_at, left_at, left_reason, profile:profiles(display_name, avatar_path)',
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

export async function leaveApartment(apartmentId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_apartment', { p_apartment_id: apartmentId });
  if (error) throw error;
}

/** Codes that can still be used. Expired and revoked codes are hidden. */
export async function fetchActiveInvites(apartmentId: string): Promise<Invite[]> {
  const { data, error } = await supabase
    .from('apartment_invites')
    .select('id, created_at, expires_at, created_by')
    .eq('apartment_id', apartmentId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Returns the code, which is shown only now: the database keeps a hash. */
export async function createInvite(apartmentId: string, validDays: number): Promise<string> {
  const { data, error } = await supabase.rpc('create_invite', {
    p_apartment_id: apartmentId,
    p_valid_days: validDays,
  });
  if (error) throw error;
  return data;
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_invite', { p_invite_id: inviteId });
  if (error) throw error;
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
