import { EXPENSE_ERROR_MESSAGES } from '@/features/expenses/errors';

/** Sentences for the error keys the quick-add functions raise. Pass to userErrorMessage. */
export const QUICK_ADD_ERROR_MESSAGES: Record<string, string> = {
  ...EXPENSE_ERROR_MESSAGES,
  too_many_templates:
    'This apartment already has 30 quick-adds. Delete one you no longer use, then try again.',
  template_not_found: 'This quick-add was already deleted.',
  fixed_split_needs_fixed_amount: 'A split by amount needs the amount.',
};
