import { storageStatusOf, userErrorMessage } from '@/lib/errors';

/** Sentences for the error keys the expense functions raise. Pass to userErrorMessage. */
export const EXPENSE_ERROR_MESSAGES: Record<string, string> = {
  not_allowed_to_add_expense:
    'You are not allowed to add expenses in this apartment. Ask an admin.',
  participant_not_member: 'Someone in the split is no longer a member. Refresh and try again.',
  payer_not_member: 'Someone who paid is no longer a member. Refresh and try again.',
  payers_must_match_total: 'What people paid must add up to the amount.',
  percentages_must_total_100: 'Percentages must add up to 100%.',
  fixed_amounts_must_match_total: 'The amounts must add up to the total.',
  invalid_category: 'This category no longer exists. Choose another one.',
  due_date_before_expense_date: 'The due date cannot be before the expense date.',
  expense_not_found: 'This expense no longer exists.',
  expense_not_unpaid: 'This bill has already been paid.',
  no_payers: 'Choose who paid.',
  duplicate_payer: 'Someone is listed twice as a payer.',
  invalid_payer_amount: 'Enter valid amounts for the people who paid.',
  expense_disputed: 'This expense is disputed. Resolve the dispute first.',
  not_allowed_to_edit_expense: 'Only the person who added this expense or an admin can change it.',
  expense_void: 'This expense has been voided and cannot be changed.',
  expense_changed:
    'Someone changed this expense while you were editing. Go back to see the latest version, then edit again.',
  unpaid_bill_has_no_payers: 'Record who paid this bill from the expense screen.',
  reason_too_long: 'Keep the reason under 500 characters.',
  immutable_record: 'This record cannot be changed.',
};

/** Explains why a receipt upload failed, using the limits of the receipts bucket. */
export function receiptUploadErrorMessage(error: unknown): string {
  const status = storageStatusOf(error);
  if (status === 413) return 'This photo is too large. Choose one under 10 MB.';
  if (status === 415) return 'Choose a JPEG, PNG or WebP photo.';
  return userErrorMessage(error, 'Could not upload the receipt. Please try again.', {
    ...EXPENSE_ERROR_MESSAGES,
    receipt_not_uploaded: 'The receipt did not finish uploading. Please try again.',
  });
}
