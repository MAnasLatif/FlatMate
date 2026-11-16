import {
  adjustedSplit,
  computeShares,
  matchDebts,
  parsePercentageToBasisPoints,
  type Share,
  SplitError,
} from './split';

// The ids sort Anas, Zubair, Ajmal, which decides who gets leftover units.
// The same cases are in supabase/tests/database/split_test.sql.
const A = '11111111-1111-1111-1111-111111111111'; // Anas
const Z = '22222222-2222-2222-2222-222222222222'; // Zubair
const J = '33333333-3333-3333-3333-333333333333'; // Ajmal

const sum = (shares: Share[]) => shares.reduce((total, share) => total + share.amountMinor, 0);
const amounts = (shares: Share[]) => shares.map((share) => share.amountMinor);

describe('computeShares', () => {
  it('splits Rs 200 equally as 66.67, 66.67, 66.66 (SRS 5.1)', () => {
    const shares = computeShares(20_000, 'equal', [{ userId: J }, { userId: A }, { userId: Z }]);
    expect(shares).toEqual([
      { userId: A, amountMinor: 6667 },
      { userId: Z, amountMinor: 6667 },
      { userId: J, amountMinor: 6666 },
    ]);
  });

  it('splits Rs 1,000 equally as 333.34, 333.33, 333.33 (SRS 5.1)', () => {
    expect(
      amounts(computeShares(100_000, 'equal', [{ userId: A }, { userId: Z }, { userId: J }])),
    ).toEqual([33_334, 33_333, 33_333]);
  });

  it('splits 50% / 25% / 25% exactly (SRS 5.1, AC-03)', () => {
    const shares = computeShares(100_000, 'percentage', [
      { userId: A, basisPoints: 5000 },
      { userId: Z, basisPoints: 2500 },
      { userId: J, basisPoints: 2500 },
    ]);
    expect(amounts(shares)).toEqual([50_000, 25_000, 25_000]);
  });

  it('gives leftover units to the largest remainders, ties by user id', () => {
    // 99,999 at 50/25/25: 49,999.5 / 24,999.75 / 24,999.75. Two units are left
    // over and go to the two .75 remainders.
    const shares = computeShares(99_999, 'percentage', [
      { userId: A, basisPoints: 5000 },
      { userId: Z, basisPoints: 2500 },
      { userId: J, basisPoints: 2500 },
    ]);
    expect(amounts(shares)).toEqual([49_999, 25_000, 25_000]);
    expect(sum(shares)).toBe(99_999);
  });

  it('excludes a participant given 0%', () => {
    const shares = computeShares(10_001, 'percentage', [
      { userId: A, basisPoints: 5000 },
      { userId: Z, basisPoints: 5000 },
      { userId: J, basisPoints: 0 },
    ]);
    expect(amounts(shares)).toEqual([5001, 5000, 0]);
  });

  it('takes fixed amounts as given', () => {
    const shares = computeShares(15_000, 'fixed', [
      { userId: A, amountMinor: 10_000 },
      { userId: Z, amountMinor: 5000 },
      { userId: J, amountMinor: 0 },
    ]);
    expect(amounts(shares)).toEqual([10_000, 5000, 0]);
  });

  it('splits one minor unit between three people', () => {
    expect(
      amounts(computeShares(1, 'equal', [{ userId: A }, { userId: Z }, { userId: J }])),
    ).toEqual([1, 0, 0]);
  });

  it('stays exact at the largest allowed amount', () => {
    const shares = computeShares(1_000_000_000_000, 'percentage', [
      { userId: A, basisPoints: 3333 },
      { userId: Z, basisPoints: 3333 },
      { userId: J, basisPoints: 3334 },
    ]);
    expect(amounts(shares)).toEqual([333_300_000_000, 333_300_000_000, 333_400_000_000]);
  });

  it.each([
    [
      'percentages that do not add up to 100',
      'percentage',
      [
        { userId: A, basisPoints: 5000 },
        { userId: Z, basisPoints: 4999 },
      ],
      'percentages_must_total_100',
    ],
    [
      'fixed amounts that do not add up to the total',
      'fixed',
      [
        { userId: A, amountMinor: 5000 },
        { userId: Z, amountMinor: 4000 },
      ],
      'fixed_amounts_must_match_total',
    ],
    [
      'a negative fixed amount',
      'fixed',
      [
        { userId: A, amountMinor: 10_000 },
        { userId: Z, amountMinor: -1 },
      ],
      'invalid_share',
    ],
    [
      'a fractional fixed amount',
      'fixed',
      [
        { userId: A, amountMinor: 4999.5 },
        { userId: Z, amountMinor: 5000.5 },
      ],
      'invalid_share',
    ],
    ['no participants', 'equal', [], 'no_participants'],
    ['the same person twice', 'equal', [{ userId: A }, { userId: A }], 'duplicate_participant'],
  ] as const)('rejects %s', (_label, method, participants, reason) => {
    expect(() => computeShares(10_000, method, participants)).toThrow(new SplitError(reason));
  });

  it.each([0, -100, 12.5, 1_000_000_000_001, Number.NaN])('rejects a total of %p', (total) => {
    expect(() => computeShares(total, 'equal', [{ userId: A }])).toThrow(
      new SplitError('invalid_total'),
    );
  });
});

describe('matchDebts', () => {
  it('has everyone else owe a single payer their share (SRS 5.1)', () => {
    const shares = computeShares(20_000, 'equal', [{ userId: A }, { userId: Z }, { userId: J }]);
    expect(matchDebts([{ userId: A, amountMinor: 20_000 }], shares)).toEqual([
      { debtorId: Z, creditorId: A, amountMinor: 6667 },
      { debtorId: J, creditorId: A, amountMinor: 6666 },
    ]);
  });

  it('lets each payer cover their own share first, then matches the rest (AC-04)', () => {
    // Rs 300 split equally; Anas paid 200, Zubair 100. Each share is 100.
    const shares = computeShares(30_000, 'equal', [{ userId: A }, { userId: Z }, { userId: J }]);
    const debts = matchDebts(
      [
        { userId: A, amountMinor: 20_000 },
        { userId: Z, amountMinor: 10_000 },
      ],
      shares,
    );
    expect(debts).toEqual([{ debtorId: J, creditorId: A, amountMinor: 10_000 }]);
  });

  it('matches several debtors across several creditors exactly', () => {
    const D = '44444444-4444-4444-4444-444444444444';
    const shares = computeShares(40_000, 'equal', [
      { userId: A },
      { userId: Z },
      { userId: J },
      { userId: D },
    ]);
    const debts = matchDebts(
      [
        { userId: A, amountMinor: 25_000 },
        { userId: Z, amountMinor: 15_000 },
      ],
      shares,
    );
    expect(debts).toEqual([
      { debtorId: J, creditorId: A, amountMinor: 10_000 },
      { debtorId: D, creditorId: A, amountMinor: 5000 },
      { debtorId: D, creditorId: Z, amountMinor: 5000 },
    ]);
    // Every creditor receives exactly what they paid beyond their own share.
    const toA = debts
      .filter((debt) => debt.creditorId === A)
      .reduce((t, d) => t + d.amountMinor, 0);
    const toZ = debts
      .filter((debt) => debt.creditorId === Z)
      .reduce((t, d) => t + d.amountMinor, 0);
    expect([toA, toZ]).toEqual([15_000, 5000]);
  });

  it('creates no debts when everyone paid exactly their share', () => {
    const shares = computeShares(20_000, 'equal', [{ userId: A }, { userId: Z }]);
    expect(
      matchDebts(
        [
          { userId: A, amountMinor: 10_000 },
          { userId: Z, amountMinor: 10_000 },
        ],
        shares,
      ),
    ).toEqual([]);
  });

  it('owes a payer who is not a participant the whole amount', () => {
    const shares = computeShares(10_000, 'equal', [{ userId: Z }, { userId: J }]);
    expect(matchDebts([{ userId: A, amountMinor: 10_000 }], shares)).toEqual([
      { debtorId: Z, creditorId: A, amountMinor: 5000 },
      { debtorId: J, creditorId: A, amountMinor: 5000 },
    ]);
  });

  it('rejects contributions that do not match the shares', () => {
    const shares = computeShares(10_000, 'equal', [{ userId: A }, { userId: Z }]);
    expect(() => matchDebts([{ userId: A, amountMinor: 9_999 }], shares)).toThrow(
      new SplitError('contributions_must_match_total'),
    );
  });
});

describe('parsePercentageToBasisPoints', () => {
  it.each([
    ['50', 5000],
    ['33.33', 3333],
    ['33,5', 3350],
    ['0', 0],
    ['100', 10_000],
    [' 12.5 ', 1250],
  ])('reads %p as %i basis points', (input, expected) => {
    expect(parsePercentageToBasisPoints(input)).toBe(expected);
  });

  it.each(['', 'abc', '100.01', '101', '33.333', '-5'])('rejects %p', (input) => {
    expect(parsePercentageToBasisPoints(input)).toBeNull();
  });
});

describe('adjustedSplit', () => {
  const A = '11111111-1111-1111-1111-111111111111';
  const Z = '22222222-2222-2222-2222-222222222222';
  const J = '33333333-3333-3333-3333-333333333333';

  it('spreads the difference over the others in proportion to their shares (decision 0004)', () => {
    const shares = [
      { userId: A, amountMinor: 10_000 },
      { userId: Z, amountMinor: 10_000 },
      { userId: J, amountMinor: 10_000 },
    ];
    expect(adjustedSplit(shares, A, 5000)).toEqual([
      { userId: A, amountMinor: 5000 },
      { userId: Z, amountMinor: 12_500 },
      { userId: J, amountMinor: 12_500 },
    ]);
  });

  it('gives leftover units to the largest remainders, the same as the database', () => {
    const shares = [
      { userId: A, amountMinor: 3334 },
      { userId: Z, amountMinor: 3333 },
      { userId: J, amountMinor: 3333 },
    ];
    // 10,000 over weights 3334 and 3333: 5000.75 and 4999.25, so Anas gets the extra unit.
    expect(adjustedSplit(shares, Z, 0)).toEqual([
      { userId: A, amountMinor: 5001 },
      { userId: Z, amountMinor: 0 },
      { userId: J, amountMinor: 4999 },
    ]);
  });

  it('keeps zero shares at zero and refuses when nobody can take on the difference', () => {
    const shares = [
      { userId: A, amountMinor: 1000 },
      { userId: Z, amountMinor: 0 },
    ];
    expect(adjustedSplit(shares, A, 500)).toBeNull();
    expect(adjustedSplit(shares, A, 1001)).toBeNull();
  });

  it('stays exact at the largest amount', () => {
    const shares = [
      { userId: A, amountMinor: 999_999_999_999 },
      { userId: Z, amountMinor: 1 },
      { userId: J, amountMinor: 0 },
    ];
    const result = adjustedSplit(shares, J, 7) ?? [];
    expect(result.reduce((sum, share) => sum + share.amountMinor, 0)).toBe(1_000_000_000_000);
  });
});
