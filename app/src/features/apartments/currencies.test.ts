import { CURRENCIES, currencySymbol, formatMoney, matchesCurrency } from './currencies';

describe('CURRENCIES', () => {
  it('lists each currency in circulation once, sorted by name', () => {
    const codes = CURRENCIES.map((currency) => currency.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeGreaterThan(150);
    const names = CURRENCIES.map((currency) => currency.name.toLowerCase());
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    // The database accepts any 3-letter code; the list must too.
    expect(codes.every((code) => /^[A-Z]{3}$/.test(code))).toBe(true);
  });

  it('gives each a name and a symbol', () => {
    expect(CURRENCIES.find((currency) => currency.code === 'USD')).toEqual({
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
    });
    expect(CURRENCIES.every((currency) => currency.name && currency.symbol)).toBe(true);
  });
});

describe('matchesCurrency', () => {
  const rupee = { code: 'INR', name: 'Indian Rupee', symbol: '₹' };

  it('matches the code, name or symbol, ignoring case and spaces', () => {
    expect(matchesCurrency(rupee, 'inr')).toBe(true);
    expect(matchesCurrency(rupee, ' indian ')).toBe(true);
    expect(matchesCurrency(rupee, '₹')).toBe(true);
    expect(matchesCurrency(rupee, '')).toBe(true);
    expect(matchesCurrency(rupee, 'dollar')).toBe(false);
  });
});

describe('formatMoney', () => {
  it('writes the symbol first, with a space after letters', () => {
    expect(formatMoney(9_000_000, 'PKR')).toBe('Rs 90,000.00');
    expect(formatMoney(1200, 'USD')).toBe('$12.00');
    expect(formatMoney(-500, 'EUR')).toBe('-€5.00');
    expect(formatMoney(0, 'PKR')).toBe('Rs 0.00');
  });

  it('falls back to the code for a currency without a symbol or one it does not know', () => {
    expect(currencySymbol('ALL')).toBe('ALL');
    expect(formatMoney(100, 'XYZ')).toBe('XYZ 1.00');
  });
});
