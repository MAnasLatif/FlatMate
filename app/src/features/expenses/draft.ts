import { formatMinorUnits, parseAmountToMinorUnits } from '@/lib/money';

import {
  computeShares,
  type Contribution,
  type Debt,
  FULL_PERCENTAGE_BASIS_POINTS,
  matchDebts,
  MAX_AMOUNT_MINOR,
  parsePercentageToBasisPoints,
  type Share,
  SplitError,
  type SplitMethod,
  type SplitParticipant,
} from './split';

export const TITLE_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 1000;

/** What the Add Expense form holds while the user edits it. Everything typed stays text. */
export type ExpenseDraft = {
  title: string;
  amount: string;
  categoryId: string | null;
  /** YYYY-MM-DD */
  expenseDate: string;
  description: string;
  /** False for a bill that is still to be paid to someone outside the apartment. */
  paidNow: boolean;
  /** YYYY-MM-DD, or empty. */
  dueDate: string;
  splitMethod: SplitMethod;
  /** Members left out of the split. */
  excluded: string[];
  percentages: Record<string, string>;
  fixedAmounts: Record<string, string>;
  payerMode: 'single' | 'multiple';
  payerId: string;
  payerAmounts: Record<string, string>;
};

export type DraftField =
  'title' | 'amount' | 'expenseDate' | 'dueDate' | 'description' | 'split' | 'payers';

export type ValidExpense = {
  title: string;
  amountMinor: number;
  categoryId: string | null;
  expenseDate: string;
  dueDate: string | null;
  description: string | null;
  splitMethod: SplitMethod;
  participants: SplitParticipant[];
  /** Empty for an unpaid bill. */
  payers: Contribution[];
};

export type DraftResult = {
  errors: Partial<Record<DraftField, string>>;
  /** Present when the whole draft is valid. */
  value?: ValidExpense;
  /** Present when the amount and split are valid, for the preview. */
  shares?: Share[];
  /** Present when the shares and payers are valid. */
  debts?: Debt[];
};

export function newDraft(currentUserId: string, today: string): ExpenseDraft {
  return {
    title: '',
    amount: '',
    categoryId: null,
    expenseDate: today,
    description: '',
    paidNow: true,
    dueDate: '',
    splitMethod: 'equal',
    excluded: [],
    percentages: {},
    fixedAmounts: {},
    payerMode: 'single',
    payerId: currentUserId,
    payerAmounts: {},
  };
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const SPLIT_MESSAGES: Record<string, string> = {
  no_participants: 'Include at least one person in the split.',
  invalid_share: 'Enter a valid share for everyone included.',
  duplicate_participant: 'Someone is listed twice.',
  invalid_total: 'Enter the amount first.',
};

/**
 * Checks the draft and, where possible, computes the shares and debts for the
 * preview with the same rules the database uses. `memberIds` are the
 * apartment's current members.
 */
export function validateDraft(
  draft: ExpenseDraft,
  memberIds: readonly string[],
  minorUnitDigits = 2,
): DraftResult {
  const errors: DraftResult['errors'] = {};
  const format = (amountMinor: number) => formatMinorUnits(amountMinor, minorUnitDigits);

  const title = draft.title.trim();
  if (title.length === 0) errors.title = 'Enter what the expense was for.';
  else if (title.length > TITLE_MAX_LENGTH)
    errors.title = `Use at most ${TITLE_MAX_LENGTH} characters.`;

  const amountMinor = parseAmountToMinorUnits(draft.amount, minorUnitDigits);
  if (amountMinor === null || amountMinor === 0) {
    errors.amount = 'Enter an amount greater than zero, such as 1500 or 1500.50.';
  } else if (amountMinor > MAX_AMOUNT_MINOR) {
    errors.amount = 'This amount is too large.';
  }

  if (!isValidDate(draft.expenseDate)) errors.expenseDate = 'Enter the date as YYYY-MM-DD.';
  const dueDate = draft.dueDate.trim();
  if (dueDate !== '') {
    if (!isValidDate(dueDate)) errors.dueDate = 'Enter the date as YYYY-MM-DD, or leave it empty.';
    else if (isValidDate(draft.expenseDate) && dueDate < draft.expenseDate) {
      errors.dueDate = 'The due date cannot be before the expense date.';
    }
  }

  const description = draft.description.trim();
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Use at most ${DESCRIPTION_MAX_LENGTH} characters.`;
  }

  const included = memberIds.filter((id) => !draft.excluded.includes(id));
  let participants: SplitParticipant[] | undefined;
  if (included.length === 0) {
    errors.split = SPLIT_MESSAGES.no_participants;
  } else if (draft.splitMethod === 'equal') {
    participants = included.map((userId) => ({ userId }));
  } else if (draft.splitMethod === 'percentage') {
    const parsed = included.map((userId) => ({
      userId,
      basisPoints: parsePercentageToBasisPoints(draft.percentages[userId] ?? ''),
    }));
    if (parsed.some((item) => item.basisPoints === null)) {
      errors.split = 'Enter a percentage for everyone included, such as 50 or 33.33.';
    } else {
      const total = parsed.reduce((sum, item) => sum + (item.basisPoints ?? 0), 0);
      if (total !== FULL_PERCENTAGE_BASIS_POINTS) {
        errors.split = `Percentages must add up to 100%. They add up to ${formatMinorUnits(total, 2)}%.`;
      } else {
        participants = parsed.map((item) => ({
          userId: item.userId,
          basisPoints: item.basisPoints ?? 0,
        }));
      }
    }
  } else {
    const parsed = included.map((userId) => ({
      userId,
      amountMinor: parseAmountToMinorUnits(draft.fixedAmounts[userId] ?? '', minorUnitDigits),
    }));
    if (parsed.some((item) => item.amountMinor === null)) {
      errors.split = 'Enter an amount for everyone included, or 0.';
    } else if (amountMinor !== null && amountMinor > 0) {
      const total = parsed.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0);
      if (total !== amountMinor) {
        errors.split = `The amounts must add up to ${format(amountMinor)}. They add up to ${format(total)}.`;
      } else {
        participants = parsed.map((item) => ({
          userId: item.userId,
          amountMinor: item.amountMinor ?? 0,
        }));
      }
    }
  }

  let shares: Share[] | undefined;
  if (participants && errors.amount === undefined && amountMinor !== null) {
    try {
      shares = computeShares(amountMinor, draft.splitMethod, participants);
    } catch (error) {
      if (!(error instanceof SplitError)) throw error;
      errors.split = SPLIT_MESSAGES[error.reason] ?? 'Check the split.';
    }
  }

  let payers: Contribution[] = [];
  if (draft.paidNow) {
    if (draft.payerMode === 'single') {
      if (!memberIds.includes(draft.payerId)) errors.payers = 'Choose who paid.';
      else if (amountMinor !== null) payers = [{ userId: draft.payerId, amountMinor }];
    } else {
      const entered = memberIds
        .map((userId) => ({ userId, text: (draft.payerAmounts[userId] ?? '').trim() }))
        .filter((item) => item.text !== '');
      const parsed = entered.map((item) => ({
        userId: item.userId,
        amountMinor: parseAmountToMinorUnits(item.text, minorUnitDigits),
      }));
      if (parsed.some((item) => item.amountMinor === null)) {
        errors.payers = 'Enter valid amounts for the people who paid.';
      } else {
        payers = parsed
          .map((item) => ({ userId: item.userId, amountMinor: item.amountMinor ?? 0 }))
          .filter((item) => item.amountMinor > 0);
        const total = payers.reduce((sum, item) => sum + item.amountMinor, 0);
        if (payers.length === 0) errors.payers = 'Enter how much each person paid.';
        else if (amountMinor !== null && amountMinor > 0 && total !== amountMinor) {
          errors.payers = `What people paid must add up to ${format(amountMinor)}. It adds up to ${format(total)}.`;
        }
      }
    }
  }

  let debts: Debt[] | undefined;
  if (shares && draft.paidNow && errors.payers === undefined && payers.length > 0) {
    debts = matchDebts(payers, shares);
  }

  const isValid = Object.keys(errors).length === 0 && shares !== undefined && participants;
  return {
    errors,
    shares,
    debts,
    value:
      isValid && amountMinor !== null && participants
        ? {
            title,
            amountMinor,
            categoryId: draft.categoryId,
            expenseDate: draft.expenseDate,
            dueDate: dueDate === '' ? null : dueDate,
            description: description === '' ? null : description,
            splitMethod: draft.splitMethod,
            participants,
            payers: draft.paidNow ? payers : [],
          }
        : undefined,
  };
}
