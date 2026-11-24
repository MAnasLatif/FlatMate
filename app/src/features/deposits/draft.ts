import {
  isValidDate,
  type PayerInput,
  type SplitInput,
  validatePayers,
  validateSplit,
} from '@/features/expenses/draft';
import {
  computeShares,
  type Contribution,
  MAX_AMOUNT_MINOR,
  type Share,
  SplitError,
} from '@/features/expenses/split';
import { formatMinorUnits, parseAmountToMinorUnits } from '@/lib/money';

import type { Deduction, NewDeposit } from './api';

/** What the deposit forms hold while an admin edits them. Typed values stay text. */
export type DeductionRow = { amount: string; reason: string };

export type DepositDraft = PayerInput &
  SplitInput & {
    title: string;
    amount: string;
    paidOn: string;
    heldBy: string;
  };

export const DEDUCTION_REASON_MAX_LENGTH = 200;

export function newDepositDraft(currentUserId: string, today: string): DepositDraft {
  return {
    title: 'Security deposit',
    amount: '',
    paidOn: today,
    heldBy: '',
    payerMode: 'single',
    payerId: currentUserId,
    payerAmounts: {},
    splitMethod: 'equal',
    excluded: [],
    percentages: {},
    fixedAmounts: {},
  };
}

export type DepositField = 'title' | 'amount' | 'paidOn' | 'heldBy' | 'payers' | 'split';

export type DepositDraftResult = {
  errors: Partial<Record<DepositField, string>>;
  value?: NewDeposit;
  shares?: Share[];
};

/** Checks a new deposit with the rules the database applies. */
export function validateDepositDraft(
  draft: DepositDraft,
  memberIds: readonly string[],
  today: string,
): DepositDraftResult {
  const errors: DepositDraftResult['errors'] = {};
  const title = draft.title.trim();
  if (title.length === 0) errors.title = 'Name the deposit, such as "Security deposit".';
  else if (title.length > 100) errors.title = 'Use at most 100 characters.';

  const amountMinor = parseAmountToMinorUnits(draft.amount);
  if (amountMinor === null || amountMinor === 0) {
    errors.amount = 'Enter the deposit, such as 90000.';
  } else if (amountMinor > MAX_AMOUNT_MINOR) {
    errors.amount = 'This amount is too large.';
  }
  if (!isValidDate(draft.paidOn)) errors.paidOn = 'Choose the day it was paid.';
  else if (draft.paidOn > today) errors.paidOn = 'It cannot be paid in the future.';
  const heldBy = draft.heldBy.trim();
  if (heldBy.length > 100) errors.heldBy = 'Use at most 100 characters.';

  const payers = validatePayers(draft, memberIds, amountMinor);
  if (payers.error) errors.payers = payers.error;
  const split = validateSplit(draft, memberIds, amountMinor);
  if (split.error) errors.split = split.error;

  let shares: Share[] | undefined;
  if (split.participants && amountMinor !== null && amountMinor > 0 && !errors.amount) {
    try {
      shares = computeShares(amountMinor, draft.splitMethod, split.participants);
    } catch (error) {
      if (!(error instanceof SplitError)) throw error;
      errors.split = 'Check the shares.';
    }
  }

  const isValid = Object.keys(errors).length === 0 && shares && split.participants && amountMinor;
  return {
    errors,
    shares,
    value: isValid
      ? {
          title,
          amountMinor: amountMinor as number,
          paidOn: draft.paidOn,
          heldBy: heldBy === '' ? null : heldBy,
          payers: payers.payers as Contribution[],
          splitMethod: draft.splitMethod,
          participants: split.participants ?? [],
        }
      : undefined,
  };
}

/**
 * Checks deductions. Rows left completely empty are ignored; every other
 * row needs an amount above zero and a reason.
 */
export function parseDeductions(rows: readonly DeductionRow[]): {
  deductions: Deduction[];
  error?: string;
} {
  const deductions: Deduction[] = [];
  for (const row of rows) {
    const reason = row.reason.trim();
    if (row.amount.trim() === '' && reason === '') continue;
    const amountMinor = parseAmountToMinorUnits(row.amount);
    if (amountMinor === null || amountMinor === 0) {
      return { deductions, error: 'Give every deduction an amount, such as 2500.' };
    }
    if (reason === '') return { deductions, error: 'Say why each deduction was kept.' };
    if (reason.length > DEDUCTION_REASON_MAX_LENGTH) {
      return {
        deductions,
        error: `Keep each reason under ${DEDUCTION_REASON_MAX_LENGTH} characters.`,
      };
    }
    deductions.push({ amountMinor, reason });
  }
  return { deductions };
}

/**
 * A refund with its deductions must make up exactly what is held. Returns
 * what was refunded, or why not.
 */
export function checkRefund(
  heldMinor: number,
  refund: string,
  deductions: readonly Deduction[],
): { refundedMinor?: number; error?: string } {
  const refundedMinor = parseAmountToMinorUnits(refund);
  if (refundedMinor === null) return { error: 'Enter what was refunded, or 0.' };
  const deducted = deductions.reduce((sum, item) => sum + item.amountMinor, 0);
  if (refundedMinor + deducted !== heldMinor) {
    return {
      error: `The refund and deductions must add up to ${formatMinorUnits(heldMinor)}. They add up to ${formatMinorUnits(refundedMinor + deducted)}.`,
    };
  }
  return { refundedMinor };
}

/** What is left to refund once the deductions are taken, for filling the field in. */
export function remainingAfter(heldMinor: number, deductions: readonly Deduction[]): number {
  return Math.max(0, heldMinor - deductions.reduce((sum, item) => sum + item.amountMinor, 0));
}
