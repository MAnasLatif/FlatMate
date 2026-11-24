import { newDraft } from '@/features/expenses/draft';

import { applyRoomSplit, isLivingOn, monthPeriod, stayLabel, validateRoomDraft } from './occupancy';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const YASIR = '33333333-3333-3333-3333-333333333333';
const WALI = '44444444-4444-4444-4444-444444444444';

const stay = (endsOn: string | null) => ({
  id: 's',
  roomId: 'r',
  userId: ANAS,
  startsOn: '2026-11-01',
  endsOn,
});

describe('stays', () => {
  it('includes both the first and last day', () => {
    expect(isLivingOn(stay('2026-11-15'), '2026-11-01')).toBe(true);
    expect(isLivingOn(stay('2026-11-15'), '2026-11-15')).toBe(true);
    expect(isLivingOn(stay('2026-11-15'), '2026-11-16')).toBe(false);
    expect(isLivingOn(stay(null), '2027-05-01')).toBe(true);
    expect(isLivingOn(stay(null), '2026-10-31')).toBe(false);
  });

  it('says since when, or from and to', () => {
    expect(stayLabel(stay(null))).toMatch(/^Since /);
    expect(stayLabel(stay('2026-11-15'))).toMatch(/ – /);
  });
});

describe('monthPeriod', () => {
  it('covers the whole month, short ones and leap years included', () => {
    expect(monthPeriod('2026-11-30')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthPeriod('2026-12-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(monthPeriod('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('validateRoomDraft', () => {
  it('takes a name and a whole weight from 1 to 100', () => {
    expect(validateRoomDraft({ name: ' Master ', weight: '3' }).value).toEqual({
      name: 'Master',
      weight: 3,
    });
    expect(validateRoomDraft({ name: '', weight: '3' }).errors.name).toBe('Give the room a name.');
    for (const weight of ['0', '101', '2.5', '', 'x']) {
      expect(validateRoomDraft({ name: 'Small', weight }).errors.weight).toBe(
        'Enter a whole number from 1 to 100.',
      );
    }
  });
});

describe('applyRoomSplit', () => {
  const period = { from: '2026-11-01', to: '2026-11-30' };
  const shares = [
    { userId: ANAS, amountMinor: 180_000, days: 30, included: true },
    { userId: ZUBAIR, amountMinor: 90_050, days: 30, included: true },
    { userId: WALI, amountMinor: 0, days: 10, included: false },
  ];

  it('fills in a split by amount and leaves out whoever has no part', () => {
    const draft = applyRoomSplit(
      { ...newDraft(ANAS, '2026-11-30'), excluded: [ZUBAIR] },
      shares,
      [ANAS, ZUBAIR, YASIR],
      period,
    );
    expect(draft.splitMethod).toBe('fixed');
    expect(draft.excluded).toEqual([YASIR]);
    expect(draft.fixedAmounts).toEqual({ [ANAS]: '1800.00', [ZUBAIR]: '900.50' });
    expect(draft.description).toMatch(/^Split by room for .+ – .+\.$/);
  });

  it('adds the period to the notes once, replacing an earlier one', () => {
    const first = applyRoomSplit(
      { ...newDraft(ANAS, '2026-11-30'), description: 'Rent' },
      shares,
      [ANAS, ZUBAIR],
      period,
    );
    expect(first.description.split('\n')).toHaveLength(2);
    const again = applyRoomSplit(first, shares, [ANAS, ZUBAIR], {
      from: '2026-11-01',
      to: '2026-11-15',
    });
    expect(again.description.split('\n')).toHaveLength(2);
    expect(again.description).not.toBe(first.description);
  });
});
