import { formatMinorUnits, minorUnitsToInput, parseAmountToMinorUnits } from './money';

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

describe('parseAmountToMinorUnits', () => {
  it.each([
    ['200', 20_000],
    ['200.5', 20_050],
    ['200.05', 20_005],
    ['1,234.56', 123_456],
    [' 0.01 ', 1],
    ['0', 0],
    ['007.10', 710],
  ])('reads %p as %i', (input, expected) => {
    expect(parseAmountToMinorUnits(input)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '1.234', '1.2.3', '12a', '.5'])('rejects %p', (input) => {
    expect(parseAmountToMinorUnits(input)).toBeNull();
  });

  it('is exact where floating point is not', () => {
    // 0.1 + 0.2 style errors cannot happen: the digits are joined as text.
    expect(parseAmountToMinorUnits('1234567890.29')).toBe(123_456_789_029);
  });

  it('supports currencies without minor units', () => {
    expect(parseAmountToMinorUnits('1500', 0)).toBe(1500);
    expect(parseAmountToMinorUnits('1500.5', 0)).toBeNull();
  });

  it('round-trips with minorUnitsToInput', () => {
    expect(minorUnitsToInput(123_450)).toBe('1234.50');
    expect(parseAmountToMinorUnits(minorUnitsToInput(123_450))).toBe(123_450);
  });
});
