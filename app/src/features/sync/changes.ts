import type { QueryKey } from '@tanstack/react-query';

import { accountKeys } from '@/features/accounts/hooks';
import { activityKeys } from '@/features/activity/hooks';
import { apartmentKeys } from '@/features/apartments/hooks';
import { expenseKeys } from '@/features/expenses/hooks';
import { inventoryKeys } from '@/features/inventory/hooks';
import { notificationKeys } from '@/features/notifications/hooks';
import { ACCOUNT_PAYMENTS_ROOT } from '@/features/payments/hooks';
import { profileKeys } from '@/features/profile/hooks';
import { quickAddKeys } from '@/features/quick-add/hooks';
import { recurringKeys } from '@/features/recurring/hooks';
import { roomKeys } from '@/features/rooms/hooks';
import { settlementKeys } from '@/features/settlement/hooks';

/**
 * Which cached data each change event makes stale (SRS section 7). The kinds
 * are the ones the database sends: the entity types of `audit_events` on an
 * apartment topic, plus the triggers on profiles and receiving accounts. A
 * new kind added on the server must be added here; until it is, an unknown
 * kind refreshes everything under its topic.
 */

export const APARTMENT_CHANGE_KINDS = [
  'adjustment',
  'apartment',
  'budget',
  'category',
  'debt_transfer',
  'deposit',
  'expense',
  'expense_template',
  'inventory_item',
  'invite',
  'join_request',
  'member',
  'rejoin_invite',
  'offset',
  'recurring_bill',
  'recurring_template',
  'payment',
  'room',
  'settlement_period',
  'profile',
  'account',
] as const;
export type ApartmentChangeKind = (typeof APARTMENT_CHANGE_KINDS)[number];

export const USER_CHANGE_KINDS = [
  'membership',
  'profile',
  'account',
  'notification',
  'notification_preference',
] as const;
export type UserChangeKind = (typeof USER_CHANGE_KINDS)[number];

/** Everything shown about the people in an apartment: names, photos, roles. */
const PROFILE_NAMES_ROOT = ['profile-names'] as const;
/** Every user's list of apartments, whatever the user. */
const ALL_MY_APARTMENTS_ROOT = ['apartments', 'mine'] as const;

type ApartmentScope = { apartmentId: string };

const apartmentChanges: Record<ApartmentChangeKind, (scope: ApartmentScope) => QueryKey[]> = {
  // Money: expenses, disputes (recorded as expense changes), payments, offsets,
  // adjustments and settlement periods all live under the apartment's money key.
  adjustment: ({ apartmentId }) => [expenseKeys.apartment(apartmentId)],
  expense: ({ apartmentId }) => [expenseKeys.apartment(apartmentId)],
  offset: ({ apartmentId }) => [expenseKeys.apartment(apartmentId)],
  // Account payment lists span apartments, so all of them are refreshed.
  payment: ({ apartmentId }) => [expenseKeys.apartment(apartmentId), ACCOUNT_PAYMENTS_ROOT],
  settlement_period: ({ apartmentId }) => [expenseKeys.apartment(apartmentId)],
  // Budgets sit with the money, since their spending changes with every expense.
  budget: ({ apartmentId }) => [expenseKeys.apartment(apartmentId)],
  // Deposits live under the money key too: their actions post adjustments.
  deposit: ({ apartmentId }) => [expenseKeys.apartment(apartmentId)],
  // Simplifications sit with the money: applying one changes balances.
  debt_transfer: ({ apartmentId }) => [expenseKeys.apartment(apartmentId)],
  expense_template: ({ apartmentId }) => [quickAddKeys.list(apartmentId)],
  // Items and which expenses count towards them. Their totals follow the
  // expenses, which refresh under the money key.
  inventory_item: ({ apartmentId }) => [inventoryKeys.all(apartmentId)],
  // Settings change names in lists, and the settlement day and objection window.
  apartment: ({ apartmentId }) => [
    apartmentKeys.detail(apartmentId),
    ALL_MY_APARTMENTS_ROOT,
    expenseKeys.apartment(apartmentId),
  ],
  // Categories are named in expense lists too.
  category: ({ apartmentId }) => [
    apartmentKeys.categories(apartmentId),
    expenseKeys.apartment(apartmentId),
  ],
  invite: ({ apartmentId }) => [apartmentKeys.invites(apartmentId)],
  // Rooms and who lives in them. Expenses split by room keep their amounts.
  room: ({ apartmentId }) => [roomKeys.all(apartmentId)],
  // Repeatable expenses, which only admins read. A bill entered or charged
  // also sends an expense event for the charge itself.
  recurring_template: ({ apartmentId }) => [recurringKeys.apartment(apartmentId)],
  recurring_bill: ({ apartmentId }) => [recurringKeys.apartment(apartmentId)],
  // Someone asked to join, or a request was answered or cancelled; approving
  // also changes the members.
  join_request: ({ apartmentId }) => [
    apartmentKeys.joinRequests(apartmentId),
    apartmentKeys.members(apartmentId),
  ],
  // An invitation back was sent, answered or withdrawn; accepting adds a member.
  rejoin_invite: ({ apartmentId }) => [
    apartmentKeys.rejoinInvites(apartmentId),
    apartmentKeys.members(apartmentId),
  ],
  // Joining, leaving, roles and permissions; balances follow who is a member.
  member: ({ apartmentId }) => [
    apartmentKeys.members(apartmentId),
    expenseKeys.apartment(apartmentId),
  ],
  profile: ({ apartmentId }) => [apartmentKeys.members(apartmentId), PROFILE_NAMES_ROOT],
  account: ({ apartmentId }) => [['accounts', 'shared', apartmentId]],
};

const userChanges: Record<UserChangeKind, (userId: string) => QueryKey[]> = {
  // Added to or removed from an apartment, or a role changed: the apartment
  // list, exits, and the member lists that decide what each screen offers.
  // Also the user's own join requests, which an admin answers, and invitations back.
  membership: (userId) => [
    ALL_MY_APARTMENTS_ROOT,
    ['apartments'],
    settlementKeys.exits(userId),
    apartmentKeys.myJoinRequests(userId),
    apartmentKeys.myRejoinInvites(userId),
  ],
  profile: (userId) => [profileKeys.profile(userId)],
  account: (userId) => [accountKeys.mine(userId)],
  // A new notification, or one read on another device.
  notification: (userId) => [notificationKeys.all(userId)],
  // Push groups turned on or off on another device.
  notification_preference: (userId) => [notificationKeys.pushPreferences(userId)],
};

function isApartmentKind(kind: string | null): kind is ApartmentChangeKind {
  return APARTMENT_CHANGE_KINDS.some((known) => known === kind);
}

function isUserKind(kind: string | null): kind is UserChangeKind {
  return USER_CHANGE_KINDS.some((known) => known === kind);
}

/** Everything cached about one apartment, for catching up and for unknown kinds. */
export function apartmentTopicKeys(apartmentId: string): QueryKey[] {
  return uniqueKeys([
    ...APARTMENT_CHANGE_KINDS.flatMap((kind) => apartmentChanges[kind]({ apartmentId })),
    activityKeys.all(apartmentId),
  ]);
}

/** Everything cached about the user across apartments. */
export function userTopicKeys(userId: string): QueryKey[] {
  return uniqueKeys(USER_CHANGE_KINDS.flatMap((kind) => userChanges[kind](userId)));
}

export function keysForApartmentChange(kind: string | null, apartmentId: string): QueryKey[] {
  return isApartmentKind(kind)
    ? // Every change is an entry in the apartment's timeline.
      [...apartmentChanges[kind]({ apartmentId }), activityKeys.all(apartmentId)]
    : apartmentTopicKeys(apartmentId);
}

export function keysForUserChange(kind: string | null, userId: string): QueryKey[] {
  return isUserKind(kind) ? userChanges[kind](userId) : userTopicKeys(userId);
}

function uniqueKeys(keys: QueryKey[]): QueryKey[] {
  const seen = new Set<string>();
  return keys.filter((key) => {
    const id = JSON.stringify(key);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
