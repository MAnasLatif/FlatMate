import { APARTMENT_ERROR_MESSAGES } from '@/features/apartments/errors';
import { EXPENSE_ERROR_MESSAGES } from '@/features/expenses/errors';

/** Sentences for the error keys the repeatable expense functions raise. Pass to userErrorMessage. */
export const RECURRING_ERROR_MESSAGES: Record<string, string> = {
  ...APARTMENT_ERROR_MESSAGES,
  ...EXPENSE_ERROR_MESSAGES,
  invalid_title: 'Enter what it is for, such as Rent.',
  invalid_total: 'Enter an amount greater than zero.',
  invalid_interval: 'Choose how often it repeats.',
  invalid_bill_day: 'Enter a day from 1 to 31.',
  invalid_due_after_days: 'Enter a number of days from 0 to 90, or leave it empty.',
  invalid_first_period: 'The first charge must be this month or within the next year.',
  variable_amount_not_allowed: 'A bill that changes each time has no amount ahead of time.',
  fixed_split_needs_fixed_amount: 'A bill that changes each time cannot be split by amount.',
  collector_not_member: 'The person asked to pay is no longer a member. Choose someone else.',
  recurring_template_not_found: 'This repeatable expense no longer exists.',
  recurring_template_archived: 'This repeatable expense was removed.',
  recurring_bill_not_found: 'This bill no longer exists.',
  recurring_bill_not_waiting: 'Another admin has already dealt with this bill.',
  due_date_before_expense_date: 'The due date cannot be before the bill arrived.',
  no_rooms: 'Add a room under Rooms on the members screen first.',
  invalid_room_period: 'Choose whether each charge is in advance or in arrears.',
  room_period_without_room_split: 'Turn on Split by room, or leave out the period.',
  no_occupants: 'Nobody who is still a member lived in a room in these days. Choose another split.',
};
