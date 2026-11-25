import { describeMyPosition, describePairExpense, myExpensePosition } from './position';

const base = { status: 'provisional', paidStatus: 'paid', revision: 2 };

describe('myExpensePosition', () => {
  it('is what the user paid minus their share: Rs 1,200 paid, Rs 700 share, Rs 500 to receive', () => {
    expect(
      myExpensePosition({
        ...base,
        splits: [{ revision: 2, amount_minor: 70_000 }],
        payers: [{ revision: 2, amount_minor: 120_000 }],
      }),
    ).toBe(50_000);
  });

  it('is negative for a share someone else paid', () => {
    expect(
      myExpensePosition({ ...base, splits: [{ revision: 2, amount_minor: 3000 }], payers: [] }),
    ).toBe(-3000);
  });

  it('uses only the current revision', () => {
    expect(
      myExpensePosition({
        ...base,
        splits: [
          { revision: 1, amount_minor: 60_000 },
          { revision: 2, amount_minor: 50_000 },
        ],
        payers: [],
      }),
    ).toBe(-50_000);
  });

  it('is zero for someone who paid exactly their own share, or is not in it', () => {
    expect(
      myExpensePosition({
        ...base,
        splits: [{ revision: 2, amount_minor: 100 }],
        payers: [{ revision: 2, amount_minor: 100 }],
      }),
    ).toBe(0);
    expect(myExpensePosition({ ...base, splits: [], payers: [] })).toBe(0);
  });

  it('has no position for a void expense or an unpaid bill', () => {
    const rows = { splits: [{ revision: 2, amount_minor: 100 }], payers: [] };
    expect(myExpensePosition({ ...base, ...rows, status: 'void' })).toBeNull();
    expect(myExpensePosition({ ...base, ...rows, paidStatus: 'unpaid' })).toBeNull();
  });
});

const money = (amountMinor: number) => `Rs ${amountMinor / 100}`;

describe('describeMyPosition', () => {
  it('shows nothing for an expense that makes no debt for the user', () => {
    expect(describeMyPosition(null, null, money)).toBeNull();
    expect(describeMyPosition(0, 0, money)).toBeNull();
  });

  it('shows the whole amount while nothing has covered it, or while it is unknown', () => {
    expect(describeMyPosition(-100_000, -100_000, money)).toEqual({
      tone: 'send',
      text: "You'll send Rs 1000",
    });
    expect(describeMyPosition(50_000, null, money)).toEqual({
      tone: 'receive',
      text: "You'll receive Rs 500",
    });
  });

  it('shows what is left once part is covered', () => {
    expect(describeMyPosition(-100_000, -60_000, money)).toEqual({
      tone: 'send',
      text: "You'll send Rs 600 of Rs 1000",
    });
  });

  it('says settled once all of it is covered', () => {
    expect(describeMyPosition(-100_000, 0, money)).toEqual({
      tone: 'settled',
      text: 'Settled: you owed Rs 1000',
    });
    expect(describeMyPosition(50_000, 0, money)).toEqual({
      tone: 'settled',
      text: 'Settled: you were owed Rs 500',
    });
  });

  it('follows what is open when a correction turned it the other way', () => {
    expect(describeMyPosition(-10_000, 5000, money)).toEqual({
      tone: 'receive',
      text: "You'll receive Rs 50",
    });
  });
});

describe('describePairExpense', () => {
  const none = { oweMinor: 0, owedMinor: 0, oweOpenMinor: 0, owedOpenMinor: 0 };

  it('says what is owed, what is left, and when it is settled', () => {
    expect(
      describePairExpense({ ...none, oweMinor: 100_000, oweOpenMinor: 100_000 }, 'Tara', money),
    ).toBe('You owe Tara Rs 1000');
    expect(
      describePairExpense({ ...none, oweMinor: 100_000, oweOpenMinor: 40_000 }, 'Tara', money),
    ).toBe('You owe Tara Rs 400 of Rs 1000');
    expect(describePairExpense({ ...none, oweMinor: 100_000 }, 'Tara', money)).toBe(
      'You owed Tara Rs 1000, settled',
    );
    expect(describePairExpense({ ...none, owedMinor: 30_000 }, 'Tara', money)).toBe(
      'Tara owed you Rs 300, settled',
    );
    expect(describePairExpense(none, 'Tara', money)).toBe('Nothing between you now');
  });
});
