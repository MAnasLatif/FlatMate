import type { DebtTransfer, DebtTransferState, DebtTransferStep } from './api';

/**
 * How a step reads, for one of its three people. It names only the amount
 * that moves, never anyone's whole balance with someone else.
 */
export function describeStep(
  step: DebtTransferStep,
  nameOf: (userId: string) => string,
  money: string,
): { headline: string; detail: string } {
  const debtor = nameOf(step.debtorId);
  const middle = nameOf(step.middleId);
  const creditor = nameOf(step.creditorId);
  const pays = debtor === 'You' ? 'pay' : 'pays';
  return {
    headline: `${debtor} ${pays} ${mid(creditor)} ${money} directly`,
    detail: `Instead of ${mid(debtor)} paying ${mid(middle)} and ${mid(middle)} paying ${mid(creditor)}. ${
      middle === 'You' ? 'You owe and are owed' : `${middle} owes and is owed`
    } ${money} less, and nobody's total changes.`,
  };
}

/** A name in the middle of a sentence: "you" for the reader. */
function mid(name: string): string {
  return name === 'You' ? 'you' : name;
}

/** Its state now: a proposal past its 7 days has lapsed even before anyone answers. */
export function stateNow(transfer: Pick<DebtTransfer, 'state' | 'expiresAt'>, now: number) {
  return transfer.state === 'proposed' && Date.parse(transfer.expiresAt) <= now
    ? 'lapsed'
    : transfer.state;
}

/** The people still to answer, in the order debtor, middle, creditor. */
export function waitingFor(transfer: DebtTransfer): string[] {
  const answered = new Set(transfer.answers.map((answer) => answer.userId));
  return [transfer.debtorId, transfer.middleId, transfer.creditorId].filter(
    (id) => !answered.has(id),
  );
}

export function isPartOf(step: DebtTransferStep, userId: string): boolean {
  return [step.debtorId, step.middleId, step.creditorId].includes(userId);
}

export const STATE_LABEL: Record<DebtTransferState, string> = {
  proposed: 'Waiting for answers',
  applied: 'Applied',
  declined: 'Declined',
  lapsed: 'Lapsed',
};
