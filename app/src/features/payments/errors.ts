import { userErrorMessage } from '@/lib/errors';
import { photoUploadErrorReason } from '@/lib/private-images';

/** Sentences for the error keys the payment functions raise. Pass to userErrorMessage. */
export const PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  not_member: 'You are not a member of this apartment.',
  cannot_pay_yourself: 'You cannot pay yourself.',
  recipient_not_member: 'This person is not a member of the apartment.',
  counterparty_not_member: 'This person is not a member of the apartment.',
  cannot_offset_with_yourself: 'You cannot net off with yourself.',
  invalid_amount: 'Enter an amount greater than zero.',
  paid_at_in_future: 'The payment date cannot be in the future.',
  reference_too_long: 'Keep the reference under 100 characters.',
  expense_not_found: 'This expense no longer exists.',
  account_not_shared:
    'That account is no longer shared with this apartment. Choose another or leave it out.',
  payment_exceeds_debt: 'That is more than you owe now. Go back to see the latest amounts.',
  nothing_to_offset: 'There is nothing left to net off between you.',
  offset_exceeds_debt:
    'That is more than can be netted off now. Go back to see the latest amounts.',
  payment_not_found: 'This payment is not available.',
  payment_void: 'This payment has been voided.',
  payment_final: 'This payment is already confirmed and cannot be voided.',
  reason_required: 'Say why you decline it.',
  reason_too_long: 'Keep the reason under 1,000 characters.',
  dispute_not_found: 'This objection is not available.',
  not_dispute_raiser: 'Only the person who declined the payment can withdraw that.',
  dispute_not_open: 'This objection has already ended.',
  not_allowed_to_add_proof: 'Only the person who paid can add proof, and not to a void payment.',
  proof_not_uploaded: 'The photo did not finish uploading. Please try again.',
};

/** The adjustment function's keys, over the payment ones it shares. */
export const ADJUSTMENT_ERROR_MESSAGES: Record<string, string> = {
  ...PAYMENT_ERROR_MESSAGES,
  reason_required: 'Say what the adjustment is for.',
  reason_too_long: 'Keep the reason under 500 characters.',
  not_allowed_to_adjust:
    'Only the person who paid, or an admin who did not receive it, can record this.',
  cannot_adjust_with_yourself: 'You cannot record an adjustment with yourself.',
  member_not_found: 'One of the two people is no longer in this apartment.',
  adjustment_does_not_match_payment: 'This adjustment does not match the payment.',
  dispute_not_open: 'This objection has already been settled.',
};

/** Explains why attaching a proof photo failed. */
export function proofUploadErrorMessage(error: unknown): string {
  return (
    photoUploadErrorReason(error) ??
    userErrorMessage(error, 'Could not attach the photo. Please try again.', PAYMENT_ERROR_MESSAGES)
  );
}
