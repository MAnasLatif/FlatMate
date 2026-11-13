import { screen, userEvent } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';

import { fetchMyApartments } from '@/features/apartments/api';
import { renderWithProviders } from '@/test/render';

import {
  createAccount,
  fetchMyAccounts,
  fetchSharedAccounts,
  type MyAccount,
  shareAccount,
  updateAccount,
  unshareAccount,
} from '../api';
import { EditAccount } from '../components/edit-account';
import { MyAccountsSection } from '../components/my-accounts';
import { SharedAccounts } from '../components/shared-accounts';

const ANAS = '11111111-1111-1111-1111-111111111111';
const FLAT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchMyApartments: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchMyAccounts: jest.fn(),
  fetchSharedAccounts: jest.fn(),
  createAccount: jest.fn(),
  updateAccount: jest.fn(),
  shareAccount: jest.fn(),
  unshareAccount: jest.fn(),
}));

const meezan: MyAccount = {
  id: 'acc-1',
  kind: 'bank',
  provider: 'Meezan Bank',
  accountTitle: 'Anas Latif',
  accountIdentifier: 'PK36MEZN0001234567890123',
  isPreferred: true,
  sharedWith: [FLAT],
};

const apartment = (id: string, name: string) => ({
  role: 'member' as const,
  canAddExpense: true,
  apartment: { id, name, location: null, show_location: false, currency: 'PKR' },
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchMyAccounts).mockResolvedValue([meezan]);
  jest
    .mocked(fetchMyApartments)
    .mockResolvedValue([apartment(FLAT, 'Flat 4B'), apartment(OTHER, 'Flat 9')]);
});

describe('SharedAccounts', () => {
  it('masks the number until revealed and copies it (FR-07.2)', async () => {
    jest.mocked(fetchSharedAccounts).mockResolvedValue([meezan]);
    await renderWithProviders(<SharedAccounts apartmentId={FLAT} userId={ANAS} name="Anas" />);
    const user = userEvent.setup();

    expect(await screen.findByText('•••• 0123')).toBeOnTheScreen();
    expect(screen.queryByText('PK36MEZN0001234567890123')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Show number' }));
    expect(screen.getByText('PK36MEZN0001234567890123')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Copy number' }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('PK36MEZN0001234567890123');
    expect(await screen.findByText('Copied')).toBeOnTheScreen();
  });

  it('says when nothing is shared', async () => {
    jest.mocked(fetchSharedAccounts).mockResolvedValue([]);
    await renderWithProviders(<SharedAccounts apartmentId={FLAT} userId={ANAS} name="Anas" />);

    expect(await screen.findByText(/Anas has not shared an account/)).toBeOnTheScreen();
  });
});

describe('MyAccountsSection', () => {
  it('lists the accounts masked, with where each is shared', async () => {
    await renderWithProviders(<MyAccountsSection />);

    expect(await screen.findByText('Anas Latif · •••• 0123')).toBeOnTheScreen();
    expect(screen.getByText('Shared with 1 apartment')).toBeOnTheScreen();
    expect(screen.getByText('Preferred')).toBeOnTheScreen();
  });
});

describe('EditAccount', () => {
  it('creates an account and shares it with the chosen apartment (FR-01.3)', async () => {
    jest.mocked(createAccount).mockResolvedValue('acc-2');
    jest.mocked(shareAccount).mockResolvedValue(undefined);
    await renderWithProviders(<EditAccount accountId={null} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Mobile wallet' }));
    await user.type(screen.getByLabelText('Wallet'), 'JazzCash');
    await user.type(screen.getByLabelText('Name on the account'), 'Anas Latif');
    await user.type(screen.getByLabelText('Wallet number'), '0300 1234567');
    await user.press(screen.getAllByRole('switch')[1]);
    await user.press(screen.getByRole('button', { name: 'Save account' }));

    expect(createAccount).toHaveBeenCalledWith(ANAS, {
      kind: 'wallet',
      provider: 'JazzCash',
      accountTitle: 'Anas Latif',
      accountIdentifier: '0300 1234567',
    });
    expect(shareAccount).toHaveBeenCalledWith('acc-2', OTHER);
    expect(router.back).toHaveBeenCalled();
  });

  it('stops sharing an account with an apartment', async () => {
    jest.mocked(updateAccount).mockResolvedValue(undefined);
    jest.mocked(unshareAccount).mockResolvedValue(undefined);
    await renderWithProviders(<EditAccount accountId="acc-1" />);
    const user = userEvent.setup();

    await screen.findByText('Flat 4B');
    await user.press(screen.getAllByRole('switch')[0]);
    await user.press(screen.getByRole('button', { name: 'Save account' }));

    expect(updateAccount).toHaveBeenCalledWith(
      'acc-1',
      expect.objectContaining({ provider: 'Meezan Bank' }),
    );
    expect(unshareAccount).toHaveBeenCalledWith('acc-1', FLAT);
    expect(shareAccount).not.toHaveBeenCalled();
  });

  it('refuses an account number with symbols', async () => {
    await renderWithProviders(<EditAccount accountId={null} />);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Bank'), 'HBL');
    await user.type(screen.getByLabelText('Name on the account'), 'Anas');
    await user.type(screen.getByLabelText('Account number or IBAN'), 'pin:1234');
    await user.press(screen.getByRole('button', { name: 'Save account' }));

    expect(screen.getByText(/using letters, digits, spaces and dashes/)).toBeOnTheScreen();
    expect(createAccount).not.toHaveBeenCalled();
  });
});
