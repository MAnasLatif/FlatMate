import { formatMinorUnits } from './money';

describe('formatMinorUnits', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [50, '0.50'],
    [100, '1.00'],
    [6667, '66.67'],
    [33334, '333.34'],
    [100000, '1,000.00'],
    [123456789, '1,234,567.89'],
  ])('formats %i minor units as %s', (amount, expected) => {
    expect(formatMinorUnits(amount)).toBe(expected);
  });

  it('keeps the sign of a negative amount', () => {
    expect(formatMinorUnits(-6667)).toBe('-66.67');
    expect(formatMinorUnits(-5)).toBe('-0.05');
    expect(formatMinorUnits(-100000)).toBe('-1,000.00');
  });

  it('is exact where floating-point division is not', () => {
    // 9007199254740991 / 100 cannot be represented exactly as a float.
    expect(formatMinorUnits(Number.MAX_SAFE_INTEGER)).toBe('90,071,992,547,409.91');
  });

  it('supports currencies with a different number of minor unit digits', () => {
    expect(formatMinorUnits(1234, 0)).toBe('1,234');
    expect(formatMinorUnits(1234567, 3)).toBe('1,234.567');
  });

  it('rejects amounts that are not whole minor units', () => {
    expect(() => formatMinorUnits(66.67)).toThrow(RangeError);
    expect(() => formatMinorUnits(Number.NaN)).toThrow(RangeError);
    expect(() => formatMinorUnits(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });

  it('rejects an invalid number of minor unit digits', () => {
    expect(() => formatMinorUnits(100, -1)).toThrow(RangeError);
    expect(() => formatMinorUnits(100, 1.5)).toThrow(RangeError);
  });
});
