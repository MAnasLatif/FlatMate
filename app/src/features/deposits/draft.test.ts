import {
  checkRefund,
  newDepositDraft,
  parseDeductions,
  remainingAfter,
  validateDepositDraft,
} from './draft';

const members = ['anas', 'zubair', 'yasir'];
const today = '2026-11-24';

describe('validateDepositDraft', () => {
  it('turns a valid draft into the deposit the database records', () => {
    const result = validateDepositDraft(
      { ...newDepositDraft('anas', today), amount: '900', heldBy: ' Landlord ' },
      members,
      today,
    );
    expect(result.value).toEqual({
      title: 'Security deposit',
      amountMinor: 90_000,
      paidOn: today,
      heldBy: 'Landlord',
      payers: [{ userId: 'anas', amountMinor: 90_000 }],
      splitMethod: 'equal',
      participants: members.map((userId) => ({ userId })),
    });
    expect(result.shares?.map((share) => share.amountMinor)).toEqual([30_000, 30_000, 30_000]);
  });

  it('explains what is wrong', () => {
    const result = validateDepositDraft(
      { ...newDepositDraft('anas', today), title: ' ', amount: '0', paidOn: '2026-12-01' },
      members,
      today,
    );
    expect(result.value).toBeUndefined();
    expect(Object.keys(result.errors).sort()).toEqual(['amount', 'paidOn', 'title']);
  });
});

describe('deductions and refunds', () => {
  it('ignores empty rows and needs an amount and reason on the rest', () => {
    expect(
      parseDeductions([
        { amount: '', reason: '' },
        { amount: '25', reason: ' Lamp ' },
      ]),
    ).toEqual({
      deductions: [{ amountMinor: 2_500, reason: 'Lamp' }],
    });
    expect(parseDeductions([{ amount: '25', reason: '' }]).error).toMatch(/why/);
    expect(parseDeductions([{ amount: '', reason: 'Lamp' }]).error).toMatch(/amount/);
  });

  it('needs the refund and deductions to make up the share', () => {
    const lamp = [{ amountMinor: 5_000, reason: 'Lamp' }];
    expect(checkRefund(30_000, '250', lamp)).toEqual({ refundedMinor: 25_000 });
    expect(checkRefund(30_000, '200', lamp).error).toBe(
      'The refund and deductions must add up to 300.00. They add up to 250.00.',
    );
    expect(remainingAfter(30_000, lamp)).toBe(25_000);
  });
});
