import { type ExpenseDraft, splitInputFrom, type ValidExpense } from '@/features/expenses/draft';
import { minorUnitsToInput } from '@/lib/money';

import type { QuickAdd, QuickAddInput } from './api';

/**
 * A template from an expense about to be saved: its name, amount, category
 * and split. Who paid and the date change every time, so they are left out.
 * An equal split among every current member is saved without names, so
 * people who join later are included when it is used.
 */
export function quickAddFromExpense(
  expense: ValidExpense,
  memberIds: readonly string[],
): QuickAddInput {
  const inSplit = new Set(expense.participants.map((participant) => participant.userId));
  const isEveryone =
    expense.splitMethod === 'equal' && memberIds.every((memberId) => inSplit.has(memberId));
  return {
    title: expense.title,
    amountMinor: expense.amountMinor,
    categoryId: expense.categoryId,
    categoryDetail: expense.categoryDetail,
    splitMethod: expense.splitMethod,
    participants: isEveryone ? null : expense.participants,
  };
}

/**
 * The Add expense form filled from a template. The date, who paid and
 * whether it is paid stay as the user set them. A category archived since is
 * left empty, and anyone in the split who has left drops out: a percentage or
 * fixed split then no longer adds up, and the form says so.
 */
export function applyQuickAdd(
  draft: ExpenseDraft,
  template: QuickAdd,
  memberIds: readonly string[],
  categoryIds: readonly string[],
  minorUnitDigits = 2,
): ExpenseDraft {
  const hasCategory = template.categoryId !== null && categoryIds.includes(template.categoryId);
  const split =
    template.participants === null
      ? { splitMethod: template.splitMethod, excluded: [], percentages: {}, fixedAmounts: {} }
      : splitInputFrom(template.splitMethod, template.participants, memberIds, minorUnitDigits);
  return {
    ...draft,
    title: template.title,
    amount:
      template.amountMinor === null ? '' : minorUnitsToInput(template.amountMinor, minorUnitDigits),
    categoryId: hasCategory ? template.categoryId : null,
    categoryDetail: hasCategory ? (template.categoryDetail ?? '') : '',
    ...split,
  };
}

/** How a template is split, in a few words for its list. */
export function describeQuickAddSplit(template: Pick<QuickAdd, 'splitMethod' | 'participants'>) {
  if (template.participants === null) return 'Split equally among everyone';
  const people =
    template.participants.length === 1 ? '1 person' : `${template.participants.length} people`;
  switch (template.splitMethod) {
    case 'equal':
      return `Split equally among ${people}`;
    case 'percentage':
      return `Split by percentage among ${people}`;
    case 'fixed':
      return `Split by amount among ${people}`;
  }
}
