import {
  isValidDate,
  type SplitInput,
  TITLE_MAX_LENGTH,
  validateSplit,
} from '@/features/expenses/draft';
import {
  computeShares,
  MAX_AMOUNT_MINOR,
  type Share,
  SplitError,
  type SplitParticipant,
} from '@/features/expenses/split';
import { minorUnitsToInput, parseAmountToMinorUnits } from '@/lib/money';
import { addDays, addMonths, monthStart } from '@/lib/time';

import type { RecurringKind, RecurringTemplate, WaitingBill } from './api';
import { isMonthly, type Repeat } from './schedule';

export const MAX_DUE_AFTER_DAYS = 90;
/** A daily or weekly expense can start up to a year ahead, as the database allows. */
export const MAX_START_DAYS_AHEAD = 365;

/** What the repeatable expense form holds while an admin edits it. Typed values stay text. */
export type RecurringDraft = SplitInput & {
  title: string;
  kind: RecurringKind;
  /** Fixed only. */
  amount: string;
  repeat: Repeat;
  /** Monthly repeats only. */
  billDay: string;
  /** Days to pay after the bill day, or '' for no due date. */
  dueAfterDays: string;
  collectorId: string | null;
  /** Monthly, when adding: the month of the first charge, as its first day. */
  firstPeriod: string;
  /** Daily and weekly, when adding: the first charge, as YYYY-MM-DD. */
  startDate: string;
};

export type ValidRecurring = {
  title: string;
  kind: RecurringKind;
  amountMinor: number | null;
  repeat: Repeat;
  /** Null for daily and weekly repeats. */
  billDay: number | null;
  /** The first charge, when adding. */
  firstDate: string;
  dueAfterDays: number | null;
  collectorId: string | null;
  splitMethod: SplitInput['splitMethod'];
  participants: SplitParticipant[];
};

export type RecurringField =
  'title' | 'amount' | 'billDay' | 'startDate' | 'dueAfterDays' | 'split';

export type RecurringResult = {
  errors: Partial<Record<RecurringField, string>>;
  value?: ValidRecurring;
  /** Each person's share of a fixed amount, once it is valid. */
  shares?: Share[];
};

/**
 * The day a bill arrives in a month: its bill day, or the last day of a
 * shorter month. The same rule as private.period_bill_date.
 */
export function billDateIn(period: string, billDay: number): string {
  const start = monthStart(period);
  const lastDay = Number(addDays(addMonths(start, 1), -1).slice(8, 10));
  return `${start.slice(0, 8)}${String(Math.min(billDay, lastDay)).padStart(2, '0')}`;
}

/** The month of the next bill day still to come: this month's, or next month's once it has passed. */
export function nextFirstPeriod(billDay: number, today: string): string {
  const thisMonth = monthStart(today);
  return billDateIn(thisMonth, billDay) >= today ? thisMonth : addMonths(thisMonth, 1);
}

export function newRecurringDraft(today: string): RecurringDraft {
  return {
    title: '',
    kind: 'fixed',
    amount: '',
    repeat: 'monthly',
    billDay: '1',
    dueAfterDays: '',
    collectorId: null,
    firstPeriod: nextFirstPeriod(1, today),
    startDate: today,
    splitMethod: 'equal',
    excluded: [],
    percentages: {},
    fixedAmounts: {},
  };
}

/** A saved split, back in the form's shape. Anyone listed but not in it starts excluded. */
export function splitInputFrom(
  splitMethod: SplitInput['splitMethod'],
  participants: readonly SplitParticipant[],
  memberIds: readonly string[],
  minorUnitDigits = 2,
): SplitInput {
  const inSplit = new Set(participants.map((participant) => participant.userId));
  return {
    splitMethod,
    excluded: memberIds.filter((id) => !inSplit.has(id)),
    percentages: Object.fromEntries(
      participants
        .filter((participant) => participant.basisPoints !== undefined)
        .map((participant) => [
          participant.userId,
          minorUnitsToInput(participant.basisPoints ?? 0, 2),
        ]),
    ),
    fixedAmounts: Object.fromEntries(
      participants
        .filter((participant) => participant.amountMinor !== undefined)
        .map((participant) => [
          participant.userId,
          minorUnitsToInput(participant.amountMinor ?? 0, minorUnitDigits),
        ]),
    ),
  };
}

export function draftFromTemplate(
  template: RecurringTemplate,
  memberIds: readonly string[],
  minorUnitDigits = 2,
): RecurringDraft {
  return {
    title: template.title,
    kind: template.kind,
    amount:
      template.amountMinor === null ? '' : minorUnitsToInput(template.amountMinor, minorUnitDigits),
    repeat: template.repeat,
    // Switching a daily or weekly expense to monthly starts from the day of its next charge.
    billDay: String(template.billDay ?? Number(template.nextBillDate.slice(8, 10))),
    dueAfterDays: template.dueAfterDays === null ? '' : String(template.dueAfterDays),
    collectorId: template.collectorId,
    firstPeriod: monthStart(template.nextBillDate),
    startDate: template.nextBillDate,
    ...splitInputFrom(template.splitMethod, template.participants, memberIds, minorUnitDigits),
  };
}

/** Shares for the form; a split the arithmetic refuses shows none and the server explains. */
function sharesOf(
  amountMinor: number,
  method: SplitInput['splitMethod'],
  participants: SplitParticipant[],
): Share[] | undefined {
  try {
    return computeShares(amountMinor, method, participants);
  } catch (error) {
    if (error instanceof SplitError) return undefined;
    throw error;
  }
}

function parseWholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * Checks the draft with the rules the database applies. `memberIds` are the
 * current members, and `today` is the apartment's date.
 */
export function validateRecurringDraft(
  draft: RecurringDraft,
  memberIds: readonly string[],
  today: string,
  minorUnitDigits = 2,
): RecurringResult {
  const errors: RecurringResult['errors'] = {};

  const title = draft.title.trim();
  if (title.length === 0) errors.title = 'Enter what it is for, such as Rent.';
  else if (title.length > TITLE_MAX_LENGTH)
    errors.title = `Use at most ${TITLE_MAX_LENGTH} characters.`;

  let amountMinor: number | null = null;
  if (draft.kind === 'fixed') {
    amountMinor = parseAmountToMinorUnits(draft.amount, minorUnitDigits);
    if (amountMinor === null || amountMinor === 0) {
      errors.amount = 'Enter an amount greater than zero, such as 45000.';
    } else if (amountMinor > MAX_AMOUNT_MINOR) {
      errors.amount = 'This amount is too large.';
    }
  }

  const monthly = isMonthly(draft.repeat);
  let billDay: number | null = null;
  let firstDate = draft.startDate;
  if (monthly) {
    billDay = parseWholeNumber(draft.billDay);
    if (billDay === null || billDay < 1 || billDay > 31) {
      errors.billDay = 'Enter a day from 1 to 31.';
      billDay = null;
    } else {
      firstDate = billDateIn(draft.firstPeriod, billDay);
    }
  } else if (!isValidDate(draft.startDate)) {
    errors.startDate = 'Choose the day of the first charge.';
  } else if (draft.startDate < today) {
    errors.startDate = 'The first charge cannot be in the past.';
  } else if (draft.startDate > addDays(today, MAX_START_DAYS_AHEAD)) {
    errors.startDate = 'Start within the next year.';
  }

  let dueAfterDays: number | null = null;
  if (draft.dueAfterDays.trim() !== '') {
    dueAfterDays = parseWholeNumber(draft.dueAfterDays);
    if (dueAfterDays === null || dueAfterDays > MAX_DUE_AFTER_DAYS) {
      errors.dueAfterDays = `Enter a number of days from 0 to ${MAX_DUE_AFTER_DAYS}, or leave it empty.`;
    }
  }

  // A variable bill's amount is unknown until it arrives, so it cannot be split by amount.
  const splitMethod =
    draft.kind === 'variable' && draft.splitMethod === 'fixed' ? 'equal' : draft.splitMethod;
  const split = validateSplit(
    { ...draft, splitMethod },
    memberIds,
    errors.amount ? null : amountMinor,
    minorUnitDigits,
  );
  if (split.error) errors.split = split.error;

  const shares =
    split.participants && amountMinor !== null && errors.amount === undefined
      ? sharesOf(amountMinor, splitMethod, split.participants)
      : undefined;

  return {
    errors,
    shares,
    value:
      Object.keys(errors).length === 0 && split.participants
        ? {
            title,
            kind: draft.kind,
            amountMinor,
            repeat: draft.repeat,
            billDay,
            firstDate,
            dueAfterDays,
            // Only a current member can be asked to pay.
            collectorId:
              draft.collectorId !== null && memberIds.includes(draft.collectorId)
                ? draft.collectorId
                : null,
            splitMethod,
            participants: split.participants,
          }
        : undefined,
  };
}

// Waiting bills ---------------------------------------------------------------------------

/** Entering a bill that waits for an admin: its amount, and this period's split. */
export type BillDraft = SplitInput & {
  amount: string;
  /** YYYY-MM-DD, or ''. */
  dueDate: string;
  collectorId: string | null;
};

export type ValidBill = {
  amountMinor: number;
  dueDate: string | null;
  collectorId: string | null;
  splitMethod: SplitInput['splitMethod'];
  participants: SplitParticipant[];
};

export type BillResult = {
  errors: Partial<Record<'amount' | 'dueDate' | 'split', string>>;
  value?: ValidBill;
  shares?: Share[];
};

/**
 * Starts from the template: its amount for a fixed one, its due date and its
 * split. People who have left are dropped, so the admin sees who shares it now.
 */
export function draftFromBill(
  bill: WaitingBill,
  memberIds: readonly string[],
  minorUnitDigits = 2,
): BillDraft {
  const { template } = bill;
  const stillHere = template.participants.filter((participant) =>
    memberIds.includes(participant.userId),
  );
  return {
    amount:
      template.amountMinor === null ? '' : minorUnitsToInput(template.amountMinor, minorUnitDigits),
    dueDate: template.dueAfterDays === null ? '' : addDays(bill.billDate, template.dueAfterDays),
    collectorId:
      template.collectorId !== null && memberIds.includes(template.collectorId)
        ? template.collectorId
        : null,
    ...splitInputFrom(template.splitMethod, stillHere, memberIds, minorUnitDigits),
  };
}

export function validateBillDraft(
  draft: BillDraft,
  billDate: string,
  memberIds: readonly string[],
  minorUnitDigits = 2,
): BillResult {
  const errors: BillResult['errors'] = {};

  const amountMinor = parseAmountToMinorUnits(draft.amount, minorUnitDigits);
  if (amountMinor === null || amountMinor === 0) {
    errors.amount = 'Enter the amount on the bill, such as 8450.';
  } else if (amountMinor > MAX_AMOUNT_MINOR) {
    errors.amount = 'This amount is too large.';
  }

  const dueDate = draft.dueDate.trim();
  if (dueDate !== '') {
    if (!isValidDate(dueDate)) errors.dueDate = 'Choose a due date, or leave it empty.';
    else if (dueDate < billDate) errors.dueDate = 'The due date cannot be before the bill arrived.';
  }

  const split = validateSplit(
    draft,
    memberIds,
    errors.amount ? null : amountMinor,
    minorUnitDigits,
  );
  if (split.error) errors.split = split.error;

  const shares =
    split.participants && amountMinor !== null && errors.amount === undefined
      ? sharesOf(amountMinor, draft.splitMethod, split.participants)
      : undefined;

  return {
    errors,
    shares,
    value:
      Object.keys(errors).length === 0 && split.participants && amountMinor !== null
        ? {
            amountMinor,
            dueDate: dueDate === '' ? null : dueDate,
            collectorId:
              draft.collectorId !== null && memberIds.includes(draft.collectorId)
                ? draft.collectorId
                : null,
            splitMethod: draft.splitMethod,
            participants: split.participants,
          }
        : undefined,
  };
}
