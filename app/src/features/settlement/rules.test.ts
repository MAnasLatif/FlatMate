import { formatMinorUnits } from '@/lib/money';

import { describeClosingBalance, obligationState } from './rules';

const money = (amount: number) => `${formatMinorUnits(amount)} PKR`;
const names: Record<string, string> = { a: 'Anas', z: 'Zubair', j: 'Ajmal' };
const nameOf = (id: string) => names[id];

describe('describeClosingBalance', () => {
  const balance = {
    memberA: 'a',
    memberB: 'z',
    finalMinor: 0,
    provisionalMinor: 0,
    disputedMinor: 0,
  };

  it("speaks from the viewer's side", () => {
    expect(
      describeClosingBalance({ ...balance, provisionalMinor: -6000 }, 'a', nameOf, money),
    ).toBe('Zubair owed you 60.00 PKR');
    expect(
      describeClosingBalance({ ...balance, provisionalMinor: -6000 }, 'z', nameOf, money),
    ).toBe('You owed Anas 60.00 PKR');
  });

  it('names both people for an admin outside the pair, and keeps held amounts apart', () => {
    expect(
      describeClosingBalance(
        { ...balance, finalMinor: 2000, disputedMinor: 9000 },
        'j',
        nameOf,
        money,
      ),
    ).toBe('Anas owed Zubair 20.00 PKR, 90.00 PKR held by disputes');
    expect(describeClosingBalance({ ...balance, disputedMinor: -500 }, 'a', nameOf, money)).toBe(
      'You and Zubair were square, 5.00 PKR held by disputes',
    );
  });
});

describe('obligationState', () => {
  const obligation = {
    expenseId: 'e',
    title: 'Cleaning',
    expenseDate: '2026-11-01',
    direction: 'owe' as const,
    amountMinor: 10_000,
    coveredMinor: 0,
    isHeld: false,
  };

  it('tells settled, partly settled, open and held apart', () => {
    expect(obligationState({ ...obligation, coveredMinor: 10_000 })).toEqual({
      remainingMinor: 0,
      state: 'settled',
    });
    expect(obligationState({ ...obligation, coveredMinor: 4000 })).toEqual({
      remainingMinor: 6000,
      state: 'partly settled',
    });
    expect(obligationState(obligation).state).toBe('open');
    expect(obligationState({ ...obligation, isHeld: true })).toEqual({
      remainingMinor: 10_000,
      state: 'held',
    });
  });
});
