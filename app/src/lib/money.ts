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

/**
 * Reads an amount typed by the user, such as "1,234.56", "1234.5" or "200",
 * as integer minor units. Thousands separators are ignored. Returns null for
 * anything that is not a plain positive or zero amount with at most
 * `minorUnitDigits` decimals. Parsed as text, never as a float.
 */
export function parseAmountToMinorUnits(input: string, minorUnitDigits = 2): number | null {
  const cleaned = input.trim().replace(/,/g, '');
  const pattern =
    minorUnitDigits === 0 ? /^(\d+)$/ : new RegExp(`^(\\d+)(?:\\.(\\d{1,${minorUnitDigits}}))?$`);
  const match = pattern.exec(cleaned);
  if (!match) return null;
  const whole = match[1].replace(/^0+(?=\d)/, '');
  const fraction = (match[2] ?? '').padEnd(minorUnitDigits, '0');
  const value = Number(`${whole}${fraction}`);
  return Number.isSafeInteger(value) ? value : null;
}

/** Minor units as an editable amount, such as 123450 -> "1234.50". No thousands separators. */
export function minorUnitsToInput(amountMinor: number, minorUnitDigits = 2): string {
  return formatMinorUnits(amountMinor, minorUnitDigits).replace(/,/g, '');
}
