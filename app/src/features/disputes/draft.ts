import { formatMinorUnits, parseAmountToMinorUnits } from '@/lib/money';

import type { DisputeKind } from './api';

export const REASON_MAX_LENGTH = 1000;

/** What the dispute form holds while the user edits it. */
export type DisputeDraft = { kind: DisputeKind; share: string; reason: string };

export type ValidDispute = { kind: DisputeKind; proposedShareMinor: number; reason: string };

/**
 * Checks a dispute before it is raised, with the rules raise_dispute applies:
 * a reason, and for an adjustment a share between zero and the total that
 * differs from the current one. A decline proposes zero.
 */
export function validateDisputeDraft(
  draft: DisputeDraft,
  currentShareMinor: number,
  totalMinor: number,
  minorUnitDigits = 2,
): { errors: { share?: string; reason?: string }; value?: ValidDispute } {
  const errors: { share?: string; reason?: string } = {};
  const reason = draft.reason.trim();
  if (reason === '') errors.reason = 'Say why you object.';
  else if (reason.length > REASON_MAX_LENGTH) {
    errors.reason = `Use at most ${REASON_MAX_LENGTH.toLocaleString('en')} characters.`;
  }

  let proposedShareMinor = 0;
  if (draft.kind === 'adjustment') {
    const parsed = parseAmountToMinorUnits(draft.share, minorUnitDigits);
    const total = formatMinorUnits(totalMinor, minorUnitDigits);
    if (parsed === null) errors.share = 'Enter the share you think is fair, such as 50 or 50.25.';
    else if (parsed > totalMinor) errors.share = `Your share cannot be more than ${total}.`;
    else if (parsed === currentShareMinor) {
      errors.share = 'That is already your share. Enter a different amount.';
    } else proposedShareMinor = parsed;
  } else if (currentShareMinor === 0) {
    errors.share = 'You already have no share of this expense.';
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { errors, value: { kind: draft.kind, proposedShareMinor, reason } };
}
