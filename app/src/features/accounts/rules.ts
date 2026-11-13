import type { AccountInput, AccountKind } from './api';

/** Shows only the last four characters, such as "•••• 0123". */
export function maskIdentifier(identifier: string): string {
  const compact = identifier.replace(/[\s-]/g, '');
  return compact.length <= 4 ? compact : `•••• ${compact.slice(-4)}`;
}

export type AccountDraft = {
  kind: AccountKind;
  provider: string;
  accountTitle: string;
  accountIdentifier: string;
};

/** Checks an account with the same limits as the database. */
export function validateAccountDraft(draft: AccountDraft): {
  errors: Partial<Record<keyof AccountDraft, string>>;
  value?: AccountInput;
} {
  const errors: Partial<Record<keyof AccountDraft, string>> = {};
  const provider = draft.provider.trim();
  const accountTitle = draft.accountTitle.trim();
  const accountIdentifier = draft.accountIdentifier.trim().replace(/\s+/g, ' ');

  if (provider === '')
    errors.provider = 'Enter the bank or wallet, such as Meezan Bank or JazzCash.';
  else if (provider.length > 60) errors.provider = 'Use at most 60 characters.';
  if (accountTitle === '') errors.accountTitle = 'Enter the name on the account.';
  else if (accountTitle.length > 100) errors.accountTitle = 'Use at most 100 characters.';
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{3,40}$/.test(accountIdentifier)) {
    errors.accountIdentifier =
      draft.kind === 'wallet'
        ? 'Enter the wallet number, such as 0300 1234567.'
        : 'Enter the account number or IBAN, using letters, digits, spaces and dashes.';
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { errors, value: { kind: draft.kind, provider, accountTitle, accountIdentifier } };
}
