import type { ComponentProps } from 'react';

import type { Chip } from 'heroui-native';

import { parseAmountToMinorUnits } from '@/lib/money';

import type { Payment, PaymentObjection } from './api';

type ChipColor = NonNullable<ComponentProps<typeof Chip>['color']>;

/**
 * How a payment's status is shown. A final payment is confirmed by app policy
 * because nobody objected in time; FlatMate never claims a bank verified it.
 */
export function paymentStatus(status: Payment['status']): {
  label: string;
  color: ChipColor;
  explanation: string;
} {
  switch (status) {
    case 'provisional':
      return {
        label: 'Recorded, provisional',
        color: 'warning',
        explanation: 'It counts as paid now, but the recipient can still object.',
      };
    case 'disputed':
      return {
        label: 'Declined',
        color: 'danger',
        explanation: 'The recipient says it did not arrive, so it does not count as paid.',
      };
    case 'final':
      return {
        label: 'Confirmed by app policy',
        color: 'success',
        explanation:
          'Nobody objected in time, so FlatMate treats it as paid. No bank has verified it.',
      };
    case 'void':
      return {
        label: 'Void',
        color: 'default',
        explanation: 'The payer cancelled it. It does not count as paid.',
      };
  }
}

export type PaymentPermissions = {
  /** The recipient says the money did not arrive. */
  canDecline: boolean;
  /** The recipient takes back their objection. */
  canWithdrawDecline: boolean;
  /** The payer cancels a payment that is not final. */
  canVoid: boolean;
  /** The payer attaches proof. */
  canAddProof: boolean;
};

/** What the viewer can do with a payment. The database enforces the same rules (decision 0005). */
export function paymentPermissions(
  payment: Pick<Payment, 'payerId' | 'recipientId' | 'status'>,
  viewerId: string,
  openObjection: Pick<PaymentObjection, 'raisedBy'> | undefined,
): PaymentPermissions {
  const isPayer = viewerId === payment.payerId;
  const isRecipient = viewerId === payment.recipientId;
  const isVoid = payment.status === 'void';
  return {
    canDecline: isRecipient && !isVoid && openObjection === undefined,
    canWithdrawDecline: isRecipient && openObjection?.raisedBy === viewerId,
    canVoid: isPayer && (payment.status === 'provisional' || payment.status === 'disputed'),
    canAddProof: isPayer && !isVoid,
  };
}

export type PayMode = 'gross' | 'net';

export type PaymentPlan = {
  /** What to net off first, in net mode. */
  offsetMinor: number;
  /** What to record as paid. Zero when netting off settles everything. */
  payMinor: number;
};

/**
 * Turns the pay form into what to record (SRS FR-07.1). In gross mode the
 * user pays part or all of what they owe. In net mode what the two owe each
 * other is netted off first, and the user pays part or all of the rest. An
 * empty amount means all of it.
 */
export function planPayment(
  owe: number,
  owed: number,
  mode: PayMode,
  amountText: string,
  minorUnitDigits = 2,
): { plan?: PaymentPlan; error?: string } {
  const offsetMinor = mode === 'net' ? Math.min(owe, owed) : 0;
  const remaining = owe - offsetMinor;
  if (owe <= 0) return { error: 'You do not owe this person anything right now.' };

  if (amountText.trim() === '') return { plan: { offsetMinor, payMinor: remaining } };
  const amount = parseAmountToMinorUnits(amountText, minorUnitDigits);
  if (amount === null || (amount === 0 && remaining > 0)) {
    return { error: 'Enter the amount you paid, such as 1500 or 1500.50.' };
  }
  if (amount > remaining) {
    return {
      error:
        mode === 'net'
          ? 'That is more than you owe after netting off.'
          : 'That is more than you owe.',
    };
  }
  return { plan: { offsetMinor, payMinor: amount } };
}
