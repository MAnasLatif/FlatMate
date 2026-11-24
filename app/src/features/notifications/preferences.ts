/**
 * The groups of push notifications a person can turn off, for every apartment
 * at once (FR-01.2). The database decides which group each notification type
 * belongs to (`private.notification_category`). Turning a group off stops only
 * its pushes: the red dots in the app still lead to what changed.
 */
export const PUSH_CATEGORIES = [
  {
    value: 'expenses',
    label: 'Expenses',
    description: 'Expenses that include you, bills you are asked to pay, and repeatable bills.',
  },
  {
    value: 'payments',
    label: 'Payments',
    description:
      'Payments to and from you, objections, netting off, adjustments, deposits and simplified debts.',
  },
  {
    value: 'disputes',
    label: 'Disputes',
    description: 'Disputes on expenses that include you, and their answers.',
  },
  {
    value: 'members',
    label: 'Members',
    description: 'People joining or leaving, requests to join, and changes to your role.',
  },
  {
    value: 'reminders',
    label: 'Reminders',
    description: 'Bills due soon that you pay, and settlement day when you owe someone.',
  },
  {
    value: 'settlement',
    label: 'Settlement',
    description: 'A settlement period closing, with its summary.',
  },
  {
    value: 'budgets',
    label: 'Budgets',
    description: 'Spending reaching 80% and 100% of a monthly budget.',
  },
] as const;

export type PushCategory = (typeof PUSH_CATEGORIES)[number]['value'];

export function isPushCategory(value: string): value is PushCategory {
  return PUSH_CATEGORIES.some((category) => category.value === value);
}

/** The muted groups with one turned on or off, for showing a change before the server answers. */
export function withPushSetting(
  muted: readonly PushCategory[],
  category: PushCategory,
  isEnabled: boolean,
): PushCategory[] {
  const others = muted.filter((value) => value !== category);
  return isEnabled ? others : [...others, category];
}
