import { activeFilterCount, NO_SEARCH, parseAmountRange, searchArguments } from './search';

describe('parseAmountRange', () => {
  it('reads amounts as whole minor units, leaving empty ends open', () => {
    expect(parseAmountRange({ min: '1,500', max: '2500.5' })).toEqual({
      ok: true,
      minMinor: 150_000,
      maxMinor: 250_050,
    });
    expect(parseAmountRange({ min: '', max: ' ' })).toEqual({
      ok: true,
      minMinor: null,
      maxMinor: null,
    });
  });

  it('says how to fix what it cannot read', () => {
    expect(parseAmountRange({ min: 'ten', max: '' })).toEqual({
      ok: false,
      error: 'Enter amounts as numbers, such as 1500 or 1500.50.',
    });
    expect(parseAmountRange({ min: '', max: '1.234' }).ok).toBe(false);
    expect(parseAmountRange({ min: '-5', max: '' }).ok).toBe(false);
  });

  it('refuses a lowest amount above the highest, and allows them equal', () => {
    expect(parseAmountRange({ min: '500', max: '100' })).toEqual({
      ok: false,
      error: 'The lowest amount must not be more than the highest.',
    });
    expect(parseAmountRange({ min: '100', max: '100' }).ok).toBe(true);
  });
});

describe('activeFilterCount', () => {
  it('counts each filter once, and the amount range as one', () => {
    expect(activeFilterCount(NO_SEARCH)).toBe(0);
    expect(activeFilterCount({ ...NO_SEARCH, query: '   ' })).toBe(0);
    expect(
      activeFilterCount({ ...NO_SEARCH, query: 'gas', status: 'final', minMinor: 1, maxMinor: 9 }),
    ).toBe(3);
  });
});

describe('searchArguments', () => {
  it('leaves out filters that are off, and trims the search', () => {
    expect(searchArguments(NO_SEARCH)).toEqual({
      p_member_id: undefined,
      p_category_id: undefined,
      p_status: undefined,
      p_min_minor: undefined,
      p_max_minor: undefined,
      p_query: undefined,
    });
    expect(searchArguments({ ...NO_SEARCH, query: '  gas ', minMinor: 0 })).toMatchObject({
      p_query: 'gas',
      p_min_minor: 0,
    });
  });
});
