import { userErrorMessage } from '@/lib/errors';
import { photoUploadErrorReason } from '@/lib/private-images';

/** Sentences for the error keys the dispute functions raise. Pass to userErrorMessage. */
export const DISPUTE_ERROR_MESSAGES: Record<string, string> = {
  expense_not_found: 'This expense no longer exists.',
  expense_void: 'This expense has been voided.',
  cannot_dispute_own_expense: 'You added this expense, so edit it instead of disputing it.',
  not_in_expense: 'Only people in the split can dispute this expense.',
  dispute_already_open: 'Someone is already disputing this expense. Wait until that dispute ends.',
  invalid_dispute_kind: 'Choose whether you decline the expense or propose another share.',
  reason_required: 'Say why you object.',
  reason_too_long: 'Keep the reason under 1,000 characters.',
  invalid_proposed_share: 'Enter a share between zero and the full amount.',
  proposal_matches_share: 'That is already your share. Enter a different amount.',
  adjustment_not_possible: 'Nobody else in the split could take on the difference.',
  dispute_not_found: 'This dispute is not available.',
  not_expense_creator: 'Only the person who added the expense can answer.',
  dispute_not_open: 'This dispute has already been answered.',
  message_required: 'Write a short message to explain.',
  message_too_long: 'Keep the message under 1,000 characters.',
  not_dispute_raiser: 'Only the person who raised the dispute can withdraw it.',
  not_allowed_to_decide: 'Only an admin who is not part of this dispute can decide it.',
  dispute_not_escalated: 'This dispute is still waiting for the person who added the expense.',
  expense_changed: 'The expense changed. Go back to see the latest version.',
  not_allowed_to_add_evidence:
    'Only the people in this dispute and admins can add photos, and only while it is open.',
  evidence_not_uploaded: 'The photo did not finish uploading. Please try again.',
};

/** Explains why adding a photo as evidence failed. */
export function evidenceUploadErrorMessage(error: unknown): string {
  return (
    photoUploadErrorReason(error) ??
    userErrorMessage(error, 'Could not add the photo. Please try again.', DISPUTE_ERROR_MESSAGES)
  );
}
