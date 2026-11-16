import type { WaitingBill } from './api';
import {
  billDateIn,
  draftFromBill,
  newRecurringDraft,
  nextFirstPeriod,
  validateBillDraft,
  validateRecurringDraft,
} from './draft';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';
const C = 'cccccccc-0000-0000-0000-000000000003';
const MEMBERS = [A, B, C];
const TODAY = '2026-11-16';

describe('billDateIn', () => {
  it('keeps a day that exists in the month', () => {
    expect(billDateIn('2027-04-01', 5)).toBe('2027-04-05');
  });
  it('moves 29 to 31 to the last day of a shorter month', () => {
    expect(billDateIn('2027-02-01', 31)).toBe('2027-02-28');
    expect(billDateIn('2028-02-01', 30)).toBe('2028-02-29');
    expect(billDateIn('2026-11-01', 31)).toBe('2026-11-30');
  });
});

describe('nextFirstPeriod', () => {
  it('is this month while the bill day is today or later', () => {
    expect(nextFirstPeriod(16, '2026-11-16')).toBe('2026-11-01');
    expect(nextFirstPeriod(31, '2026-11-30')).toBe('2026-11-01');
  });
  it('is next month once the bill day has passed', () => {
    expect(nextFirstPeriod(1, '2026-11-16')).toBe('2026-12-01');
    expect(nextFirstPeriod(1, '2026-12-02')).toBe('2027-01-01');
  });
});

describe('validateRecurringDraft', () => {
  const rent = {
    ...newRecurringDraft('2026-11-16'),
    title: ' Rent ',
    amount: '90000',
    billDay: '1',
    dueAfterDays: '9',
  };

  it('accepts a fixed rent split equally, with exact shares', () => {
    const result = validateRecurringDraft({ ...rent, amount: '1000' }, MEMBERS, TODAY);
    expect(result.errors).toEqual({});
    expect(result.value).toMatchObject({
      title: 'Rent',
      kind: 'fixed',
      amountMinor: 100000,
      billDay: 1,
      dueAfterDays: 9,
      participants: [{ userId: A }, { userId: B }, { userId: C }],
    });
    expect(result.shares?.reduce((sum, share) => sum + share.amountMinor, 0)).toBe(100000);
  });

  it('needs an amount for a fixed template and none for a variable one', () => {
    expect(
      validateRecurringDraft({ ...rent, amount: '' }, MEMBERS, TODAY).errors.amount,
    ).toBeDefined();
    const power = validateRecurringDraft({ ...rent, kind: 'variable', amount: '' }, MEMBERS, TODAY);
    expect(power.errors).toEqual({});
    expect(power.value?.amountMinor).toBeNull();
  });

  it('never splits a variable bill by amount', () => {
    const result = validateRecurringDraft(
      { ...rent, kind: 'variable', amount: '', splitMethod: 'fixed' },
      MEMBERS,
      TODAY,
    );
    expect(result.value?.splitMethod).toBe('equal');
  });

  it('checks a variable bill split by percentage without an amount', () => {
    const result = validateRecurringDraft(
      {
        ...rent,
        kind: 'variable',
        amount: '',
        splitMethod: 'percentage',
        percentages: { [A]: '50', [B]: '25', [C]: '20' },
      },
      MEMBERS,
      TODAY,
    );
    expect(result.errors.split).toMatch(/add up to 100%/);
  });

  it('rejects bill days and due days out of range', () => {
    expect(
      validateRecurringDraft({ ...rent, billDay: '32' }, MEMBERS, TODAY).errors.billDay,
    ).toBeDefined();
    expect(
      validateRecurringDraft({ ...rent, billDay: '0' }, MEMBERS, TODAY).errors.billDay,
    ).toBeDefined();
    expect(
      validateRecurringDraft({ ...rent, dueAfterDays: '91' }, MEMBERS, TODAY).errors.dueAfterDays,
    ).toBeDefined();
    expect(
      validateRecurringDraft({ ...rent, dueAfterDays: '' }, MEMBERS, TODAY).value?.dueAfterDays,
    ).toBeNull();
  });

  it('keeps a monthly charge on its day, starting in the chosen month', () => {
    const result = validateRecurringDraft(
      { ...rent, billDay: '31', firstPeriod: '2027-02-01' },
      MEMBERS,
      TODAY,
    );
    expect(result.value).toMatchObject({ repeat: 'monthly', billDay: 31, firstDate: '2027-02-28' });
  });

  it('starts a daily or weekly charge on a date, with no day of the month', () => {
    const weekly = validateRecurringDraft(
      { ...rent, repeat: 'fortnightly', billDay: '', startDate: '2026-11-20' },
      MEMBERS,
      TODAY,
    );
    expect(weekly.errors).toEqual({});
    expect(weekly.value).toMatchObject({
      repeat: 'fortnightly',
      billDay: null,
      firstDate: '2026-11-20',
    });
    expect(
      validateRecurringDraft({ ...rent, repeat: 'daily', startDate: '2026-11-15' }, MEMBERS, TODAY)
        .errors.startDate,
    ).toBeDefined();
    expect(
      validateRecurringDraft({ ...rent, repeat: 'daily', startDate: '2027-12-01' }, MEMBERS, TODAY)
        .errors.startDate,
    ).toBeDefined();
  });

  it('drops a collector who is no longer a member', () => {
    const result = validateRecurringDraft({ ...rent, collectorId: 'gone' }, MEMBERS, TODAY);
    expect(result.value?.collectorId).toBeNull();
  });
});

describe('waiting bills', () => {
  const bill: WaitingBill = {
    id: 'bill-1',
    billDate: '2026-11-05',
    reason: 'amount_needed',
    template: {
      id: 't-1',
      title: 'Electricity',
      kind: 'variable',
      amountMinor: null,
      repeat: 'monthly',
      billDay: 5,
      dueAfterDays: 7,
      collectorId: C,
      splitMethod: 'percentage',
      participants: [
        { userId: A, basisPoints: 5000 },
        { userId: B, basisPoints: 2500 },
        { userId: C, basisPoints: 2500 },
      ],
      nextBillDate: '2026-12-05',
      isPaused: false,
    },
  };

  it('starts from the template, with the due date counted from the bill day', () => {
    const draft = draftFromBill(bill, MEMBERS);
    expect(draft).toMatchObject({
      amount: '',
      dueDate: '2026-11-12',
      collectorId: C,
      splitMethod: 'percentage',
      excluded: [],
      percentages: { [A]: '50.00', [B]: '25.00', [C]: '25.00' },
    });
  });

  it('leaves out people who have left, and the collector if they left', () => {
    const draft = draftFromBill(bill, [A, B]);
    expect(draft.collectorId).toBeNull();
    expect(draft.percentages[C]).toBeUndefined();
    // Their percentage is gone, so the admin must fix the split before saving.
    expect(
      validateBillDraft({ ...draft, amount: '100' }, bill.billDate, [A, B]).errors.split,
    ).toMatch(/100%/);
  });

  it('needs the real amount and splits it exactly', () => {
    const draft = draftFromBill(bill, MEMBERS);
    expect(validateBillDraft(draft, bill.billDate, MEMBERS).errors.amount).toBeDefined();
    const result = validateBillDraft({ ...draft, amount: '4500.01' }, bill.billDate, MEMBERS);
    expect(result.errors).toEqual({});
    expect(result.value?.amountMinor).toBe(450001);
    expect(result.shares?.reduce((sum, share) => sum + share.amountMinor, 0)).toBe(450001);
  });

  it('is not due before the bill arrived', () => {
    const draft = { ...draftFromBill(bill, MEMBERS), amount: '10', dueDate: '2026-11-04' };
    expect(validateBillDraft(draft, bill.billDate, MEMBERS).errors.dueDate).toBeDefined();
  });
});
