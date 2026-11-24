import type { Href } from 'expo-router';

import { formatMoney } from '@/features/apartments/currencies';
import { formatDate } from '@/lib/time';
import type { Json } from '@/types/database';

import type { ActivityEntry } from './api';

/**
 * How the timeline words each entry (FR-10.8), and where tapping it goes.
 * Names come from `nameOf`, which returns "You" for the reader. An entry
 * nobody made by hand, such as an expense becoming final, has no actor.
 */
export type ActivityContext = {
  currency: string;
  nameOf: (userId: string) => string;
};

type JsonObject = { [key: string]: Json | undefined };

function detail(details: Json, key: string): Json | undefined {
  return typeof details === 'object' && details !== null && !Array.isArray(details)
    ? (details as JsonObject)[key]
    : undefined;
}

function text(details: Json, key: string): string | undefined {
  const value = detail(details, key);
  return typeof value === 'string' ? value : undefined;
}

function amount(details: Json, key: string): number | undefined {
  const value = detail(details, key);
  return typeof value === 'number' ? value : undefined;
}

export function describeActivity(entry: ActivityEntry, context: ActivityContext): string {
  const sentence = describe(entry, context);
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function possessive(name: string): string {
  return name === 'You' ? 'your' : `${name}'s`;
}

function describe(entry: ActivityEntry, context: ActivityContext): string {
  const { nameOf } = context;
  const money = (value: number | null | undefined) =>
    value === null || value === undefined ? '' : ` of ${formatMoney(value, context.currency)}`;
  const actor = entry.actorId ? nameOf(entry.actorId) : 'FlatMate';
  const person = entry.personId ? nameOf(entry.personId) : 'someone';
  const other = entry.counterpartyId ? nameOf(entry.counterpartyId) : 'someone';
  const expense = entry.subject ?? 'an expense';
  const key = `${entry.entityType}.${entry.action}`;

  switch (key) {
    case 'expense.created':
      return detail(entry.details, 'paid') === false
        ? `${actor} added ${expense} as an unpaid bill`
        : `${actor} added ${expense}`;
    case 'expense.edited':
      return `${actor} edited ${expense}`;
    case 'expense.voided':
      return `${actor} cancelled ${expense}`;
    case 'expense.bill_paid':
      return `${actor} recorded that ${expense} was paid`;
    case 'expense.receipt_added':
      return `${actor} attached a receipt to ${expense}`;
    case 'expense.collector_set':
      return `${actor} chose who pays ${expense}`;
    case 'expense.finalized':
      return `${expense} became final. Nobody objected in time`;
    case 'expense.dispute_raised':
      return `${actor} disputed ${expense}`;
    case 'expense.dispute_accepted':
      return `${actor} accepted a dispute on ${expense}`;
    case 'expense.dispute_rejected':
      return `${actor} rejected a dispute on ${expense}`;
    case 'expense.dispute_decided':
      return `${actor} decided a dispute on ${expense}`;
    case 'expense.dispute_withdrawn':
      return `${actor} withdrew a dispute on ${expense}`;
    case 'expense.dispute_evidence_added':
      return `${actor} added evidence to a dispute on ${expense}`;

    case 'payment.recorded':
      return `${actor} recorded a payment${money(entry.amountMinor)} to ${other}`;
    case 'payment.proof_added':
      return `${actor} added proof to a payment to ${other}`;
    case 'payment.declined':
      return `${actor} objected to a payment${money(entry.amountMinor)} from ${person}`;
    case 'payment.decline_withdrawn':
      return `${actor} withdrew an objection to a payment from ${person}`;
    case 'payment.confirmed_by_app_policy':
      return `A payment${money(entry.amountMinor)} from ${person} to ${other} became final. Nobody objected in time`;
    case 'payment.voided':
      return `${actor} voided a payment${money(entry.amountMinor)} from ${person} to ${other}`;
    case 'offset.netted_off':
      return `${actor} netted off debts${money(entry.amountMinor)} between ${person} and ${other}`;
    case 'adjustment.recorded':
      return `${actor} recorded an adjustment${money(entry.amountMinor)}: ${person} owes ${other}`;
    case 'settlement_period.closed': {
      const from = text(entry.details, 'starts_on');
      const to = text(entry.details, 'ends_on');
      return from && to
        ? `The settlement period ${formatDate(from)} – ${formatDate(to)} closed`
        : 'A settlement period closed';
    }

    case 'member.joined':
      return `${person} joined`;
    case 'member.left':
      return `${person} left`;
    case 'member.removed':
      return `${actor} removed ${person}`;
    case 'member.hidden':
      return `${actor} took ${person} off the members list`;
    case 'member.role_changed':
      return text(entry.details, 'to') === 'admin'
        ? `${actor} made ${person} an admin`
        : `${actor} made ${person} a member`;
    case 'member.expense_permission_changed':
      return detail(entry.details, 'can_add_expense') === false
        ? `${actor} stopped ${person} adding expenses`
        : `${actor} let ${person} add expenses`;
    case 'join_request.requested':
      return `${person} asked to join`;
    case 'join_request.approved':
      return `${actor} let ${person} join`;
    case 'join_request.declined':
      return `${actor} declined ${possessive(person)} request to join`;
    case 'join_request.cancelled':
      return `${person} cancelled a request to join`;
    case 'rejoin_invite.sent':
      return `${actor} invited ${person} back`;
    case 'rejoin_invite.declined':
      return `${person} declined an invitation back`;
    case 'rejoin_invite.cancelled':
      return `${actor} withdrew the invitation to ${person}`;
    case 'invite.created':
      return `${actor} made a new join code`;
    case 'invite.revoked':
      return `${actor} turned off a join code`;

    case 'apartment.created':
      return `${actor} created the apartment`;
    case 'apartment.settings_changed':
      return `${actor} changed the apartment's settings`;
    case 'apartment.reminders_changed':
      return `${actor} changed the reminders`;
    case 'category.created':
      return `${actor} added the category ${entry.subject ?? text(entry.details, 'name') ?? ''}`.trim();
    case 'category.renamed': {
      const from = text(entry.details, 'from');
      const to = text(entry.details, 'to');
      return from && to
        ? `${actor} renamed the category ${from} to ${to}`
        : `${actor} renamed a category`;
    }
    case 'category.archived':
      return entry.subject
        ? `${actor} archived the category ${entry.subject}`
        : `${actor} archived a category`;
    case 'budget.set': {
      const limit = amount(entry.details, 'after');
      const target = budgetTarget(entry);
      return limit === undefined
        ? `${actor} set the budget ${target}`
        : `${actor} set the budget ${target} to ${formatMoney(limit, context.currency)} a month`;
    }
    case 'budget.removed':
      return `${actor} removed the budget ${budgetTarget(entry)}`;
    case 'expense_template.created':
    case 'expense_template.updated':
      return entry.subject
        ? `${actor} saved the quick-add ${entry.subject}`
        : `${actor} saved a quick-add`;
    case 'expense_template.deleted':
      return `${actor} deleted a quick-add`;
    case 'recurring_template.created':
      return `${actor} added the repeatable expense ${entry.subject ?? ''}`.trim();
    case 'recurring_template.edited':
      return `${actor} changed the repeatable expense ${entry.subject ?? ''}`.trim();
    case 'recurring_template.paused':
      return `${actor} paused the repeatable expense ${entry.subject ?? ''}`.trim();
    case 'recurring_template.resumed':
      return `${actor} resumed the repeatable expense ${entry.subject ?? ''}`.trim();
    case 'recurring_template.archived':
      return `${actor} stopped the repeatable expense ${entry.subject ?? ''}`.trim();
    case 'recurring_bill.posted':
      return `${actor} entered the ${entry.subject ?? 'repeatable'} bill`;
    case 'recurring_bill.skipped':
      return `${actor} skipped a ${entry.subject ?? 'repeatable'} bill`;
    case 'recurring_bill.amount_needed':
      return `A ${entry.subject ?? 'repeatable'} bill is waiting for its amount`;
    case 'recurring_bill.needs_review':
      return `A ${entry.subject ?? 'repeatable'} bill is waiting for its split to be checked`;
  }
  return entry.subject ? `${actor} changed ${entry.subject}` : `${actor} made a change`;
}

/** "for all spending", or "for Groceries" while the category exists. */
function budgetTarget(entry: ActivityEntry): string {
  if (detail(entry.details, 'category_id') === null) return 'for all spending';
  return entry.subject ? `for ${entry.subject}` : 'for a category';
}

/**
 * The screen an entry opens, or null when it has none to open. The screen
 * checks access again, so a record that has gone shows as not available.
 */
export function activityHref(
  entry: ActivityEntry,
  apartmentId: string,
  viewer: { userId: string; isAdmin: boolean },
): Href | null {
  switch (entry.entityType) {
    case 'expense': {
      const disputeId = text(entry.details, 'dispute_id');
      if (disputeId && entry.action.startsWith('dispute_')) {
        return {
          pathname: '/apartments/[apartmentId]/disputes/[disputeId]',
          params: { apartmentId, disputeId },
        };
      }
      return {
        pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
        params: { apartmentId, expenseId: entry.entityId },
      };
    }
    case 'payment':
      return {
        pathname: '/apartments/[apartmentId]/payments/[paymentId]',
        params: { apartmentId, paymentId: entry.entityId },
      };
    case 'offset':
    case 'adjustment': {
      // The reader's balance with the other person, when they are one of the two.
      const memberId =
        entry.personId === viewer.userId
          ? entry.counterpartyId
          : entry.counterpartyId === viewer.userId
            ? entry.personId
            : null;
      return memberId
        ? {
            pathname: '/apartments/[apartmentId]/ledger/[memberId]',
            params: { apartmentId, memberId },
          }
        : null;
    }
    case 'settlement_period':
      return { pathname: '/apartments/[apartmentId]/settlement', params: { apartmentId } };
    case 'member':
      return { pathname: '/apartments/[apartmentId]/members', params: { apartmentId } };
    case 'expense_template':
      return { pathname: '/apartments/[apartmentId]/quick-adds', params: { apartmentId } };
  }
  if (!viewer.isAdmin) return null;
  // The rest is managed in the settings, which only admins open.
  switch (entry.entityType) {
    case 'apartment':
      return { pathname: '/apartments/[apartmentId]/settings', params: { apartmentId } };
    case 'category':
    case 'budget':
      return {
        pathname: '/apartments/[apartmentId]/settings',
        params: { apartmentId, tab: 'expenses' },
      };
    case 'invite':
    case 'join_request':
    case 'rejoin_invite':
      return {
        pathname: '/apartments/[apartmentId]/settings',
        params: { apartmentId, tab: 'members' },
      };
    case 'recurring_template':
    case 'recurring_bill':
      return {
        pathname: '/apartments/[apartmentId]/settings',
        params: { apartmentId, tab: 'recurring' },
      };
  }
  return null;
}
