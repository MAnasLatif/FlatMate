import type { DebtTransfer } from './api';
import { describeStep, isPartOf, stateNow, waitingFor } from './describe';

const names: Record<string, string> = { a: 'Anas', z: 'Zubair', y: 'You' };
const nameOf = (id: string) => names[id] ?? 'Someone';
const step = { debtorId: 'z', middleId: 'a', creditorId: 'y', amountMinor: 100_000 };

describe('describeStep', () => {
  it('says who pays whom directly, and only the amount that moves', () => {
    expect(describeStep(step, nameOf, 'Rs 1,000.00')).toEqual({
      headline: 'Zubair pays you Rs 1,000.00 directly',
      detail:
        "Instead of Zubair paying Anas and Anas paying you. Anas owes and is owed Rs 1,000.00 less, and nobody's total changes.",
    });
  });

  it('reads naturally for the person who pays and for the one in the middle', () => {
    expect(
      describeStep({ ...step, debtorId: 'y', creditorId: 'z' }, nameOf, 'Rs 5.00').headline,
    ).toBe('You pay Zubair Rs 5.00 directly');
    expect(
      describeStep({ ...step, middleId: 'y', creditorId: 'a' }, nameOf, 'Rs 5.00').detail,
    ).toBe(
      "Instead of Zubair paying you and you paying Anas. You owe and are owed Rs 5.00 less, and nobody's total changes.",
    );
  });
});

describe('a proposal', () => {
  const transfer: DebtTransfer = {
    ...step,
    id: 't',
    state: 'proposed',
    proposedBy: 'z',
    expiresAt: '2026-12-01T00:00:00Z',
    createdAt: '2026-11-24T00:00:00Z',
    answers: [{ userId: 'z', accepted: true }],
  };

  it('waits for those who have not answered', () => {
    expect(waitingFor(transfer)).toEqual(['a', 'y']);
    expect(isPartOf(transfer, 'a')).toBe(true);
    expect(isPartOf(transfer, 'w')).toBe(false);
  });

  it('has lapsed once its 7 days are over, even before anyone answers', () => {
    expect(stateNow(transfer, Date.parse('2026-11-30T00:00:00Z'))).toBe('proposed');
    expect(stateNow(transfer, Date.parse('2026-12-01T00:00:00Z'))).toBe('lapsed');
    expect(stateNow({ ...transfer, state: 'applied' }, Date.parse('2027-01-01'))).toBe('applied');
  });
});
