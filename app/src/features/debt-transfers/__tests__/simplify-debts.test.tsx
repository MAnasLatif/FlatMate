import { screen, userEvent, waitFor } from '@testing-library/react-native';

import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { renderWithProviders } from '@/test/render';

import {
  answerDebtTransfer,
  type DebtTransfer,
  fetchDebtTransfers,
  fetchSuggestions,
  proposeDebtTransfer,
} from '../api';
import { SimplifyDebts } from '../components/simplify-debts';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const YASIR = '33333333-3333-3333-3333-333333333333';
const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
let mockCurrentUser = ZUBAIR;

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/features/notifications/hooks', () => ({ useMarkSeen: jest.fn() }));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchDebtTransfers: jest.fn(),
  fetchSuggestions: jest.fn(),
  proposeDebtTransfer: jest.fn(),
  answerDebtTransfer: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({ useCurrentUserId: () => mockCurrentUser }));

const apartment: Apartment = {
  id: APARTMENT,
  name: 'Flat 4B',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  settlement_day: 1,
  approval_days: 7,
  due_reminder_days: 1,
  settlement_reminder_days: 2,
  location: null,
  show_location: false,
  created_by: ANAS,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

function member(userId: string, displayName: string): Member {
  return {
    membershipId: `m-${userId}`,
    userId,
    role: 'member',
    canAddExpense: true,
    joinedAt: '2026-11-01T00:00:00Z',
    leftAt: null,
    leftReason: null,
    hiddenAt: null,
    displayName,
    avatarPath: null,
  };
}

const step = { debtorId: ZUBAIR, middleId: ANAS, creditorId: YASIR, amountMinor: 100_000 };
const proposal: DebtTransfer = {
  ...step,
  id: 'transfer-1',
  state: 'proposed',
  proposedBy: ZUBAIR,
  expiresAt: '2999-01-01T00:00:00Z',
  createdAt: '2026-11-24T00:00:00Z',
  answers: [{ userId: ZUBAIR, accepted: true }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = ZUBAIR;
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest
    .mocked(fetchMembers)
    .mockResolvedValue([member(ANAS, 'Anas'), member(ZUBAIR, 'Zubair'), member(YASIR, 'Yasir')]);
  jest.mocked(fetchSuggestions).mockResolvedValue([step]);
  jest.mocked(fetchDebtTransfers).mockResolvedValue([]);
  jest.mocked(proposeDebtTransfer).mockResolvedValue('transfer-1');
  jest.mocked(answerDebtTransfer).mockResolvedValue('applied');
});

it('suggests paying someone directly, and proposes it', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<SimplifyDebts apartmentId={APARTMENT} />);

  expect(await screen.findByText('You pay Yasir Rs 1,000.00 directly')).toBeOnTheScreen();
  expect(screen.getByText(/nobody's total changes/)).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Propose it' }));

  await waitFor(() => expect(proposeDebtTransfer).toHaveBeenCalled());
  const [apartmentId, proposed, requestId] = jest.mocked(proposeDebtTransfer).mock.calls[0];
  expect(apartmentId).toBe(APARTMENT);
  expect(proposed).toEqual(step);
  expect(requestId).toEqual(expect.any(String));
});

it('asks the others in a proposal to accept or decline', async () => {
  mockCurrentUser = ANAS;
  jest.mocked(fetchSuggestions).mockResolvedValue([]);
  jest.mocked(fetchDebtTransfers).mockResolvedValue([proposal]);
  const user = userEvent.setup();
  await renderWithProviders(<SimplifyDebts apartmentId={APARTMENT} />);

  expect(await screen.findByText('Zubair pays Yasir Rs 1,000.00 directly')).toBeOnTheScreen();
  expect(screen.getByText(/Waiting for you and Yasir/)).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Accept' }));
  await waitFor(() =>
    expect(jest.mocked(answerDebtTransfer).mock.calls[0]).toEqual(['transfer-1', true]),
  );
});

it('lets the proposer withdraw, but not answer twice', async () => {
  jest.mocked(fetchSuggestions).mockResolvedValue([]);
  jest.mocked(fetchDebtTransfers).mockResolvedValue([proposal]);
  await renderWithProviders(<SimplifyDebts apartmentId={APARTMENT} />);

  expect(await screen.findByText('You accepted.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Withdraw and decline' })).toBeOnTheScreen();
});

it('lists earlier simplifications with how they ended', async () => {
  jest.mocked(fetchSuggestions).mockResolvedValue([]);
  jest.mocked(fetchDebtTransfers).mockResolvedValue([
    { ...proposal, id: 'old', state: 'applied' },
    { ...proposal, id: 'gone', expiresAt: '2000-01-01T00:00:00Z' },
  ]);
  await renderWithProviders(<SimplifyDebts apartmentId={APARTMENT} />);

  expect(await screen.findByText('Applied')).toBeOnTheScreen();
  expect(screen.getByText('Lapsed')).toBeOnTheScreen();
  expect(screen.getByText('Nothing to simplify for you right now.')).toBeOnTheScreen();
});
