import { EXPENSE_ERROR_MESSAGES } from '@/features/expenses/errors';

/** Sentences for the error keys the deposit functions raise. Pass to userErrorMessage. */
export const DEPOSIT_ERROR_MESSAGES: Record<string, string> = {
  ...EXPENSE_ERROR_MESSAGES,
  not_admin: 'Only admins of this apartment can change its deposits.',
  deposit_not_found: 'This deposit is no longer available.',
  deposit_action_not_found: 'This change is no longer available.',
  invalid_paid_on: 'Choose the day the deposit was paid. It cannot be in the future.',
  invalid_held_by: 'Keep who holds it under 100 characters.',
  more_than_share: 'That is more than this person holds of the deposit.',
  invalid_takeover: 'Choose two different people.',
  no_share: 'This person holds nothing of the deposit any more.',
  refund_must_match_share:
    'The refund and deductions must add up to what is held. Refresh: the shares may have changed.',
  invalid_deductions: 'Give every deduction an amount and a reason.',
  former_member_holds_share:
    'Someone who has left still holds a share. Record their refund or a takeover first.',
  not_latest_action: 'Only the latest change can be undone. Refresh and try again.',
};
