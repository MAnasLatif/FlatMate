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

/** Explains why attaching a proof photo failed. */
export function proofUploadErrorMessage(error: unknown): string {
  return (
    photoUploadErrorReason(error) ??
    userErrorMessage(error, 'Could not attach the photo. Please try again.', PAYMENT_ERROR_MESSAGES)
  );
}
