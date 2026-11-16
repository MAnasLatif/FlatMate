import { myExpensePosition } from './position';

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
