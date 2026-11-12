/**
 * Formats an amount held as an integer number of minor units (paisa for PKR)
 * for display, for example 123456 -> "1,234.56".
 *
 * Money is never converted to a floating-point number, not even for display:
 * the digits are split as text, so no rounding can creep in.
 */
export function formatMinorUnits(amountMinor: number, minorUnitDigits = 2): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError('Amount must be a whole number of minor units.');
  }
  if (!Number.isInteger(minorUnitDigits) || minorUnitDigits < 0) {
    throw new RangeError('Minor unit digits must be a non-negative whole number.');
  }

  const digits = String(Math.abs(amountMinor)).padStart(minorUnitDigits + 1, '0');
  const whole = digits.slice(0, digits.length - minorUnitDigits);
  const fraction = digits.slice(digits.length - minorUnitDigits);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = amountMinor < 0 ? '-' : '';

  return minorUnitDigits === 0 ? `${sign}${grouped}` : `${sign}${grouped}.${fraction}`;
}
