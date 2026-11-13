import { maskIdentifier, validateAccountDraft } from './rules';

describe('maskIdentifier', () => {
  it('shows only the last four characters', () => {
    expect(maskIdentifier('PK36MEZN0001234567890123')).toBe('•••• 0123');
    expect(maskIdentifier('0300 1234567')).toBe('•••• 4567');
    expect(maskIdentifier('1234')).toBe('1234');
  });
});

describe('validateAccountDraft', () => {
  const draft = {
    kind: 'bank' as const,
    provider: ' Meezan Bank ',
    accountTitle: 'Anas Latif',
    accountIdentifier: ' PK36 MEZN  0001 ',
  };

  it('tidies a valid account', () => {
    expect(validateAccountDraft(draft).value).toEqual({
      kind: 'bank',
      provider: 'Meezan Bank',
      accountTitle: 'Anas Latif',
      accountIdentifier: 'PK36 MEZN 0001',
    });
  });

  it('explains what is missing or not allowed', () => {
    const result = validateAccountDraft({
      ...draft,
      kind: 'wallet',
      provider: '',
      accountTitle: ' ',
      accountIdentifier: 'pin:1234',
    });
    expect(result.value).toBeUndefined();
    expect(result.errors).toEqual({
      provider: 'Enter the bank or wallet, such as Meezan Bank or JazzCash.',
      accountTitle: 'Enter the name on the account.',
      accountIdentifier: 'Enter the wallet number, such as 0300 1234567.',
    });
  });
});
