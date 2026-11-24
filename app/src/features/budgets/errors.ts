/** Sentences for the error keys the budget functions raise. Pass to userErrorMessage. */
export const BUDGET_ERROR_MESSAGES: Record<string, string> = {
  not_admin: 'Only admins of this apartment can change its budgets.',
  invalid_limit: 'Enter a budget greater than zero.',
  invalid_category: 'This category no longer exists. Refresh and try again.',
  not_member: 'You can no longer see this apartment.',
};
