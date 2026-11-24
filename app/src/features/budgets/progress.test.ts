import { budgetLevel, budgetPercent, describeBudget } from './progress';

describe('budgetLevel', () => {
  it('is near from 80% and over from 100%, as the alerts are', () => {
    expect(budgetLevel(39_999, 50_000)).toBe('under');
    expect(budgetLevel(40_000, 50_000)).toBe('near');
    expect(budgetLevel(49_999, 50_000)).toBe('near');
    expect(budgetLevel(50_000, 50_000)).toBe('over');
    expect(budgetLevel(80_000, 50_000)).toBe('over');
  });

  it('rounds nothing: 80% of an odd cap is reached only at or above it', () => {
    // 80% of 3 minor units is 2.4, so 2 is under and 3 is over.
    expect(budgetLevel(2, 3)).toBe('under');
    expect(budgetLevel(3, 3)).toBe('over');
  });
});

describe('budgetPercent', () => {
  it('fills the bar in whole percent and stops at full', () => {
    expect(budgetPercent(0, 50_000)).toBe(0);
    expect(budgetPercent(12_345, 50_000)).toBe(24);
    expect(budgetPercent(90_000, 50_000)).toBe(100);
  });
});

describe('describeBudget', () => {
  it('says what is left, reached or over', () => {
    expect(describeBudget(40_000, 50_000, 'PKR')).toEqual({
      spent: 'Rs 400.00 of Rs 500.00',
      remaining: 'Rs 100.00 left',
    });
    expect(describeBudget(50_000, 50_000, 'PKR').remaining).toBe('Budget reached');
    expect(describeBudget(60_000, 50_000, 'PKR').remaining).toBe('Rs 100.00 over');
  });
});
