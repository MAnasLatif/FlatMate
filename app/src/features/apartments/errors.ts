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
  invite_not_found: 'This code no longer exists.',
  '23514': 'Some details are not valid. Check them and try again.',
  '23505': 'A category with this name already exists.',
};
