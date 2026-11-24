import { type ExpenseDraft, newDraft, type ValidExpense } from '@/features/expenses/draft';

import type { QuickAdd } from './api';
import { applyQuickAdd, describeQuickAddSplit, quickAddFromExpense } from './templates';

const members = ['anas', 'zubair', 'ajmal'];

const expense: ValidExpense = {
  title: 'Groceries',
  amountMinor: 300_000,
  categoryId: 'food',
  categoryDetail: null,
  expenseDate: '2026-11-24',
  dueDate: null,
  description: 'From the corner shop',
  collectorId: null,
  splitMethod: 'equal',
  participants: members.map((userId) => ({ userId })),
  payers: [{ userId: 'anas', amountMinor: 300_000 }],
};

describe('quickAddFromExpense', () => {
  it('keeps the name, amount, category and split, not who paid or the notes', () => {
    expect(quickAddFromExpense(expense, members)).toEqual({
      title: 'Groceries',
      amountMinor: 300_000,
      categoryId: 'food',
      categoryDetail: null,
      splitMethod: 'equal',
      participants: null,
    });
  });

  it('names the people when an equal split leaves someone out', () => {
    const someone = { ...expense, participants: [{ userId: 'anas' }, { userId: 'zubair' }] };
    expect(quickAddFromExpense(someone, members).participants).toEqual([
      { userId: 'anas' },
      { userId: 'zubair' },
    ]);
  });

  it('always names the people of a percentage or fixed split', () => {
    const shares = members.map((userId) => ({ userId, amountMinor: 100_000 }));
    const fixed = { ...expense, splitMethod: 'fixed' as const, participants: shares };
    expect(quickAddFromExpense(fixed, members).participants).toEqual(shares);
  });
});

describe('applyQuickAdd', () => {
  const draft: ExpenseDraft = {
    ...newDraft('zubair', '2026-11-24'),
    title: 'Something else',
    excluded: ['ajmal'],
    paidNow: false,
  };
  const template: QuickAdd = {
    id: 't1',
    title: 'Milk',
    amountMinor: 12_050,
    categoryId: 'food',
    categoryDetail: null,
    splitMethod: 'equal',
    participants: null,
  };

  it('fills in the template and keeps the date and who paid', () => {
    const filled = applyQuickAdd(draft, template, members, ['food']);
    expect(filled).toMatchObject({
      title: 'Milk',
      amount: '120.50',
      categoryId: 'food',
      splitMethod: 'equal',
      excluded: [],
      expenseDate: '2026-11-24',
      payerId: 'zubair',
      paidNow: false,
    });
  });

  it('leaves the amount empty when it differs each time', () => {
    expect(applyQuickAdd(draft, { ...template, amountMinor: null }, members, ['food']).amount).toBe(
      '',
    );
  });

  it('drops a category that was archived since', () => {
    const filled = applyQuickAdd(draft, { ...template, categoryDetail: 'Gas cylinder' }, members, [
      'other',
    ]);
    expect(filled.categoryId).toBeNull();
    expect(filled.categoryDetail).toBe('');
  });

  it('includes only the people named, and leaves out anyone who has left', () => {
    const filled = applyQuickAdd(
      draft,
      {
        ...template,
        splitMethod: 'percentage',
        participants: [
          { userId: 'anas', basisPoints: 5_000 },
          { userId: 'gone', basisPoints: 5_000 },
        ],
      },
      members,
      ['food'],
    );
    expect(filled.splitMethod).toBe('percentage');
    expect(filled.excluded).toEqual(['zubair', 'ajmal']);
    expect(filled.percentages).toMatchObject({ anas: '50.00' });
  });
});

describe('describeQuickAddSplit', () => {
  it('says how it is split', () => {
    expect(describeQuickAddSplit({ splitMethod: 'equal', participants: null })).toBe(
      'Split equally among everyone',
    );
    expect(
      describeQuickAddSplit({
        splitMethod: 'fixed',
        participants: [{ userId: 'a' }, { userId: 'b' }],
      }),
    ).toBe('Split by amount among 2 people');
    expect(
      describeQuickAddSplit({ splitMethod: 'percentage', participants: [{ userId: 'a' }] }),
    ).toBe('Split by percentage among 1 person');
  });
});
