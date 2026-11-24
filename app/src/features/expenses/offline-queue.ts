import type { Member } from '@/features/apartments/api';
import { isRetryableError, userErrorMessage } from '@/lib/errors';
import type { QueuedEntry } from '@/lib/offline-queue';

import { type ExpenseDraft, validateDraft, type ValidExpense } from './draft';
import { EXPENSE_ERROR_MESSAGES } from './errors';

/**
 * An expense added while offline, waiting on the phone to be sent (FR-10.7,
 * SRS FR-10.7). It is sent by itself when the connection returns, with its
 * id as the request id, so however often it is sent it is added once. Until
 * the server accepts it, it is not an expense: nobody else sees it and no
 * balance includes it.
 */
export type QueuedExpense = {
  id: string;
  apartmentId: string;
  savedAt: string;
  /** The form as the user left it. */
  draft: ExpenseDraft;
  /** The members when it was saved, so anyone who joined since is not added to the split. */
  memberIds: string[];
  /** Why the server turned it down, for the user to fix; null while it waits to be sent. */
  failure: string | null;
};

export const MAX_QUEUED_PER_APARTMENT = 20;

export class QueueLimitError extends Error {
  constructor() {
    super('too_many_queued');
  }
}

/** Reads a queued expense back, or null when it is not one this app version can use. */
export function toQueuedExpense(entry: QueuedEntry): QueuedExpense | null {
  const value = entry.value;
  if (typeof value !== 'object' || value === null) return null;
  const { draft, memberIds, failure } = value as {
    draft?: unknown;
    memberIds?: unknown;
    failure?: unknown;
  };
  if (!isExpenseDraft(draft) || !isStringArray(memberIds)) return null;
  return {
    id: entry.id,
    apartmentId: entry.apartmentId,
    savedAt: entry.savedAt,
    draft,
    memberIds,
    failure: typeof failure === 'string' ? failure : null,
  };
}

export function toQueuedEntry(expense: QueuedExpense): QueuedEntry {
  return {
    id: expense.id,
    apartmentId: expense.apartmentId,
    savedAt: expense.savedAt,
    value: { draft: expense.draft, memberIds: expense.memberIds, failure: expense.failure },
  };
}

/**
 * Adds a queued expense or replaces the one with its id. An apartment holds
 * at most 20; one more throws QueueLimitError.
 */
export function upsertQueued(entries: QueuedEntry[], expense: QueuedExpense): QueuedEntry[] {
  const others = entries.filter((entry) => entry.id !== expense.id);
  const isNew = others.length === entries.length;
  if (
    isNew &&
    others.filter((entry) => entry.apartmentId === expense.apartmentId).length >=
      MAX_QUEUED_PER_APARTMENT
  ) {
    throw new QueueLimitError();
  }
  return [...others, toQueuedEntry(expense)];
}

/** Marks a queued expense as turned down, keeping it for the user to fix. */
export function markFailed(entries: QueuedEntry[], id: string, failure: string): QueuedEntry[] {
  return entries.map((entry) => {
    const expense = entry.id === id ? toQueuedExpense(entry) : null;
    return expense ? toQueuedEntry({ ...expense, failure }) : entry;
  });
}

/**
 * The draft as it should be sent or shown now: anyone who joined since it
 * was saved is left out of the split, as they were not there when it was
 * written. Someone who has left is caught by the form's own checks.
 */
export function draftForMembers(
  expense: Pick<QueuedExpense, 'draft' | 'memberIds'>,
  currentMemberIds: readonly string[],
): ExpenseDraft {
  const newcomers = currentMemberIds.filter((id) => !expense.memberIds.includes(id));
  return {
    ...expense.draft,
    excluded: [...new Set([...expense.draft.excluded, ...newcomers])],
  };
}

export type SendOutcome =
  /** The server added it, or had already added it on an earlier try. */
  | { kind: 'sent'; expenseId: string }
  /** It no longer fits, or the server turned it down: the user fixes it. */
  | { kind: 'failed'; reason: string }
  /** It could not reach the server; it stays queued for the next reconnect. */
  | { kind: 'waiting' };

export type SendDependencies = {
  fetchMembers: (apartmentId: string) => Promise<Member[]>;
  postExpense: (apartmentId: string, expense: ValidExpense, requestId: string) => Promise<string>;
};

const NO_LONGER_FITS =
  'Some details no longer fit, such as someone in it who has left. Open it to fix it.';

/** Sends one queued expense, checked against the apartment's members now. */
export async function sendQueuedExpense(
  expense: QueuedExpense,
  dependencies: SendDependencies,
): Promise<SendOutcome> {
  try {
    const members = await dependencies.fetchMembers(expense.apartmentId);
    const current = members.filter((member) => member.leftAt === null).map((m) => m.userId);
    const result = validateDraft(draftForMembers(expense, current), current);
    if (!result.value) return { kind: 'failed', reason: NO_LONGER_FITS };
    const expenseId = await dependencies.postExpense(expense.apartmentId, result.value, expense.id);
    return { kind: 'sent', expenseId };
  } catch (error) {
    if (isRetryableError(error)) return { kind: 'waiting' };
    return {
      kind: 'failed',
      reason: userErrorMessage(error, 'The server did not accept it.', EXPENSE_ERROR_MESSAGES),
    };
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  );
}

const STRING_FIELDS = [
  'title',
  'amount',
  'categoryDetail',
  'expenseDate',
  'description',
  'dueDate',
  'payerId',
] as const;

function isExpenseDraft(value: unknown): value is ExpenseDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    STRING_FIELDS.every((field) => typeof draft[field] === 'string') &&
    (draft.categoryId === null || typeof draft.categoryId === 'string') &&
    (draft.collectorId === null || typeof draft.collectorId === 'string') &&
    typeof draft.paidNow === 'boolean' &&
    (draft.splitMethod === 'equal' ||
      draft.splitMethod === 'percentage' ||
      draft.splitMethod === 'fixed') &&
    isStringArray(draft.excluded) &&
    isStringRecord(draft.percentages) &&
    isStringRecord(draft.fixedAmounts) &&
    (draft.payerMode === 'single' || draft.payerMode === 'multiple') &&
    isStringRecord(draft.payerAmounts)
  );
}
