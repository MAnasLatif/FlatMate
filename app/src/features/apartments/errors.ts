/**
 * Sentences for the error keys the apartment and member functions raise.
 * Pass to userErrorMessage from '@/lib/errors'.
 */
export const APARTMENT_ERROR_MESSAGES: Record<string, string> = {
  not_admin: 'Only admins of this apartment can do that.',
  last_admin: 'An apartment needs at least one admin. Make someone else an admin first.',
  use_leave: 'To stop being a member yourself, leave the apartment instead.',
  member_not_found: 'This person is no longer a member.',
  invalid_timezone: 'This time zone is not recognised. Use a name such as Asia/Karachi.',
  category_not_found: 'This category no longer exists.',
  category_fixed: 'Other stays as it is, for anything that fits nowhere else.',
  invite_not_found: 'This code no longer exists.',
  still_a_member: 'This person is a member again, so they stay in the list.',
  already_member: 'This person is already a member.',
  not_former_member: 'Only someone who used to be a member can be invited back.',
  '23514': 'Some details are not valid. Check them and try again.',
  '23505': 'A category with this name already exists.',
};

/** Sentences for the errors of invitations to rejoin, where an invite is not a join code. */
export const REJOIN_ERROR_MESSAGES: Record<string, string> = {
  ...APARTMENT_ERROR_MESSAGES,
  invite_not_found: 'This invitation is no longer available.',
  invite_not_pending: 'This invitation was already answered or withdrawn.',
};

/** Sentences for the errors of emailing an invite (the send-invite-email function). */
export const INVITE_EMAIL_ERROR_MESSAGES: Record<string, string> = {
  ...APARTMENT_ERROR_MESSAGES,
  invalid_email: 'Enter a valid email address.',
  rate_limited: 'Too many invites have been emailed today. Try again tomorrow, or share a code.',
  send_failed: 'The email could not be sent. Try again, or share a code instead.',
  not_configured: 'Email invites are not set up yet. Share a code instead.',
  unreachable: 'Could not reach FlatMate. Check your connection and try again.',
};
