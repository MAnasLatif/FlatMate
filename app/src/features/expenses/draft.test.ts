import {
  draftFromExpense,
  type ExpenseDraft,
  isValidDate,
  newDraft,
  type PostedExpense,
  validateDraft,
  validatePayers,
} from './draft';

const A = '11111111-1111-1111-1111-111111111111';
const Z = '22222222-2222-2222-2222-222222222222';
const J = '33333333-3333-3333-3333-333333333333';
const members = [A, Z, J];

function draft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return { ...newDraft(A, '2026-11-13'), title: 'Cleaning', amount: '200', ...overrides };
}

describe('validateDraft', () => {
  it('turns a simple draft into an expense paid by the current user (SRS 5.1)', () => {
    const result = validateDraft(draft(), members);
    expect(result.errors).toEqual({});
    expect(result.value).toEqual({
      title: 'Cleaning',
      amountMinor: 20_000,
      categoryId: null,
      expenseDate: '2026-11-13',
      dueDate: null,
      description: null,
      splitMethod: 'equal',
      participants: [{ userId: A }, { userId: Z }, { userId: J }],
      payers: [{ userId: A, amountMinor: 20_000 }],
    });
    expect(result.shares?.map((share) => share.amountMinor)).toEqual([6667, 6667, 6666]);
    expect(result.debts).toEqual([
      { debtorId: Z, creditorId: A, amountMinor: 6667 },
      { debtorId: J, creditorId: A, amountMinor: 6666 },
    ]);
  });

  it('asks for a title and an amount', () => {
    const result = validateDraft(draft({ title: '  ', amount: '0' }), members);
    expect(result.errors.title).toBeDefined();
    expect(result.errors.amount).toBeDefined();
    expect(result.value).toBeUndefined();
  });

  it('leaves excluded members out of the split', () => {
    const result = validateDraft(draft({ excluded: [J], amount: '100' }), members);
    expect(result.shares).toEqual([
      { userId: A, amountMinor: 5000 },
      { userId: Z, amountMinor: 5000 },
    ]);
  });

  it('refuses a split with nobody in it', () => {
    expect(validateDraft(draft({ excluded: members }), members).errors.split).toMatch(
      /at least one/,
    );
  });

  it('checks that percentages add up to 100 and says what they add up to', () => {
    const result = validateDraft(
      draft({ splitMethod: 'percentage', percentages: { [A]: '50', [Z]: '25', [J]: '20' } }),
      members,
    );
    expect(result.errors.split).toBe('Percentages must add up to 100%. They add up to 95.00%.');
  });

  it('accepts a 50 / 25 / 25 split (AC-03)', () => {
    const result = validateDraft(
      draft({
        amount: '1000',
        splitMethod: 'percentage',
        percentages: { [A]: '50', [Z]: '25', [J]: '25' },
      }),
      members,
    );
    expect(result.errors).toEqual({});
    expect(result.value?.participants).toEqual([
      { userId: A, basisPoints: 5000 },
      { userId: Z, basisPoints: 2500 },
      { userId: J, basisPoints: 2500 },
    ]);
  });

  it('checks that fixed amounts add up to the total', () => {
    const result = validateDraft(
      draft({
        amount: '150',
        splitMethod: 'fixed',
        fixedAmounts: { [A]: '100', [Z]: '40', [J]: '0' },
      }),
      members,
    );
    expect(result.errors.split).toBe('The amounts must add up to 150.00. They add up to 140.00.');
  });

  it('accepts several payers whose amounts add up (AC-04)', () => {
    const result = validateDraft(
      draft({ amount: '300', payerMode: 'multiple', payerAmounts: { [A]: '200', [Z]: '100' } }),
      members,
    );
    expect(result.errors).toEqual({});
    expect(result.debts).toEqual([{ debtorId: J, creditorId: A, amountMinor: 10_000 }]);
  });

  it('refuses payers who do not cover the amount', () => {
    const result = validateDraft(
      draft({ amount: '300', payerMode: 'multiple', payerAmounts: { [A]: '200', [Z]: '50' } }),
      members,
    );
    expect(result.errors.payers).toBe(
      'What people paid must add up to 300.00. It adds up to 250.00.',
    );
  });

  it('records an unpaid bill with no payers and no debts', () => {
    const result = validateDraft(draft({ paidNow: false, dueDate: '2026-11-20' }), members);
    expect(result.errors).toEqual({});
    expect(result.value?.payers).toEqual([]);
    expect(result.value?.dueDate).toBe('2026-11-20');
    expect(result.debts).toBeUndefined();
  });

  it('refuses a due date before the expense date', () => {
    expect(validateDraft(draft({ dueDate: '2026-11-12' }), members).errors.dueDate).toMatch(
      /before/,
    );
  });

  it('refuses a payer who is not a member', () => {
    expect(
      validateDraft(draft({ payerId: '44444444-4444-4444-4444-444444444444' }), members).errors
        .payers,
    ).toBe('Choose who paid.');
  });
});

describe('isValidDate', () => {
  it.each(['2026-11-13', '2024-02-29', '2026-12-31'])('accepts %p', (value) => {
    expect(isValidDate(value)).toBe(true);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-11-31', '13/11/2026', '', '2026-1-1'])(
    'rejects %p',
    (value) => {
      expect(isValidDate(value)).toBe(false);
    },
  );
});

describe('validatePayers', () => {
  const single = { payerMode: 'single' as const, payerId: Z, payerAmounts: {} };

  it('lets one member pay the whole bill', () => {
    expect(validatePayers(single, members, 9000)).toEqual({
      payers: [{ userId: Z, amountMinor: 9000 }],
    });
  });

  it('refuses a payer who has left', () => {
    expect(validatePayers(single, [A, J], 9000).error).toBe('Choose who paid.');
  });

  it('leaves out members with a blank or zero amount', () => {
    const result = validatePayers(
      { payerMode: 'multiple', payerId: A, payerAmounts: { [A]: '60', [Z]: '', [J]: '0' } },
      members,
      6000,
    );
    expect(result).toEqual({ payers: [{ userId: A, amountMinor: 6000 }] });
  });

  it('says what several payers add up to when it is not the amount', () => {
    const result = validatePayers(
      { payerMode: 'multiple', payerId: A, payerAmounts: { [A]: '60', [Z]: '20' } },
      members,
      9000,
    );
    expect(result.error).toBe('What people paid must add up to 90.00. It adds up to 80.00.');
  });

  it('asks for amounts when nobody entered one', () => {
    expect(
      validatePayers({ payerMode: 'multiple', payerId: A, payerAmounts: {} }, members, 9000).error,
    ).toBe('Enter how much each person paid.');
  });
});

describe('draftFromExpense', () => {
  const posted: PostedExpense = {
    title: 'Groceries',
    amountMinor: 30_000,
    categoryId: 'food',
    expenseDate: '2026-11-10',
    description: null,
    paidStatus: 'paid',
    dueDate: null,
    splitMethod: 'percentage',
    splits: [
      { userId: A, amountMinor: 15_000, basisPoints: 5000 },
      { userId: Z, amountMinor: 15_000, basisPoints: 5000 },
    ],
    payers: [
      { userId: A, amountMinor: 20_000 },
      { userId: Z, amountMinor: 10_000 },
    ],
  };

  it('fills the form from the current revision and excludes people outside the split', () => {
    const draft = draftFromExpense(posted, members, A);
    expect(draft).toMatchObject({
      title: 'Groceries',
      amount: '300.00',
      categoryId: 'food',
      description: '',
      paidNow: true,
      splitMethod: 'percentage',
      excluded: [J],
      percentages: { [A]: '50.00', [Z]: '50.00' },
      payerMode: 'multiple',
      payerAmounts: { [A]: '200.00', [Z]: '100.00' },
    });
  });

  it('validates back to the same expense when nothing is changed', () => {
    const result = validateDraft(draftFromExpense(posted, members, A), members);
    expect(result.errors).toEqual({});
    expect(result.value).toMatchObject({
      amountMinor: 30_000,
      participants: [
        { userId: A, basisPoints: 5000 },
        { userId: Z, basisPoints: 5000 },
      ],
      payers: [
        { userId: A, amountMinor: 20_000 },
        { userId: Z, amountMinor: 10_000 },
      ],
    });
  });

  it('keeps an unpaid bill unpaid, with the current user ready as payer', () => {
    const draft = draftFromExpense(
      { ...posted, paidStatus: 'unpaid', payers: [], splitMethod: 'equal', dueDate: '2026-11-20' },
      members,
      Z,
    );
    expect(draft).toMatchObject({
      paidNow: false,
      payerMode: 'single',
      payerId: Z,
      dueDate: '2026-11-20',
    });
  });
});
