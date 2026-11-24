/** Sentences for the error keys the simplification functions raise. Pass to userErrorMessage. */
export const DEBT_TRANSFER_ERROR_MESSAGES: Record<string, string> = {
  not_member: 'You are no longer a member of this apartment.',
  not_in_transfer: 'Only the three people in it can propose or answer it.',
  transfer_needs_three_people: 'It takes three different people.',
  transfer_member_left: 'Someone in it is no longer a member.',
  transfer_exceeds_debt: 'The debts changed since this was suggested. Pull down to see the latest.',
  transfer_already_proposed: 'This was already proposed. Pull down to see it.',
  transfer_not_found: 'This simplification is no longer available.',
  invalid_amount: 'The amount must be more than zero.',
};
