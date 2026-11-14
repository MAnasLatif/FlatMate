import { CURRENCIES, matchesCurrency } from './currencies';

describe('CURRENCIES', () => {
  it('lists each currency in circulation once, with Pakistan first', () => {
    const codes = CURRENCIES.map((currency) => currency.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeGreaterThan(150);
    expect(codes[0]).toBe('PKR');
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
