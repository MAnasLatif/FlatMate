import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { renderWithProviders } from '@/test/render';

import {
  type Deposit,
  fetchDeposits,
  recordDeposit,
  returnDeposit,
  takeOverDepositShare,
  undoDepositAction,
} from '../api';
import { DepositDetail } from '../components/deposit-detail';
import { DepositList } from '../components/deposit-list';
import { RecordDeposit } from '../components/record-deposit';
import { ReturnDeposit, TakeOverShare } from '../components/share-forms';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const WALI = '44444444-4444-4444-4444-444444444444';
const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DEPOSIT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
let mockCurrentUser = ANAS;

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchDeposits: jest.fn(),
  recordDeposit: jest.fn(),
  takeOverDepositShare: jest.fn(),
  returnDeposit: jest.fn(),
  undoDepositAction: jest.fn(),
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

function member(userId: string, displayName: string, role: Member['role'] = 'member'): Member {
  return {
    membershipId: `m-${userId}`,
    userId,
    role,
    canAddExpense: true,
    joinedAt: '2026-11-01T00:00:00Z',
    leftAt: null,
    leftReason: null,
    hiddenAt: null,
    displayName,
    avatarPath: null,
  };
}

/** Rs 600 that Anas paid, shared equally by Anas and Zubair. */
const deposit: Deposit = {
  id: DEPOSIT,
  title: 'Flat deposit',
  amountMinor: 60_000,
  paidOn: '2026-11-01',
  heldBy: 'Landlord',
  actions: [
    {
      id: 'r',
      kind: 'recorded',
      position: 1,
      reversesActionId: null,
      deductions: [],
      receivedBy: null,
      createdBy: ANAS,
      createdAt: '2026-11-01T10:00:00Z',
    },
  ],
  entries: [
    {
      actionId: 'r',
      userId: ANAS,
      kind: 'share',
      amountMinor: 30_000,
      counterpartyId: null,
      reason: null,
    },
    {
      actionId: 'r',
      userId: ZUBAIR,
      kind: 'share',
      amountMinor: 30_000,
      counterpartyId: null,
      reason: null,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = ANAS;
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest
    .mocked(fetchMembers)
    .mockResolvedValue([
      member(ANAS, 'Anas', 'admin'),
      member(ZUBAIR, 'Zubair'),
      member(WALI, 'Wali'),
    ]);
  jest.mocked(fetchDeposits).mockResolvedValue([deposit]);
  jest.mocked(recordDeposit).mockResolvedValue(DEPOSIT);
  jest.mocked(takeOverDepositShare).mockResolvedValue();
  jest.mocked(returnDeposit).mockResolvedValue();
  jest.mocked(undoDepositAction).mockResolvedValue();
});

it('lists deposits with what the user holds', async () => {
  await renderWithProviders(<DepositList apartmentId={APARTMENT} />);
  expect(
    await screen.findByRole('button', {
      name: 'Flat deposit, Rs 600.00, Held, you hold Rs 300.00',
    }),
  ).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Record a deposit' })).toBeOnTheScreen();
});

it('shows a member the shares and history, without the admin actions', async () => {
  mockCurrentUser = ZUBAIR;
  await renderWithProviders(<DepositDetail apartmentId={APARTMENT} depositId={DEPOSIT} />);

  expect(await screen.findByText('Anas recorded the deposit of Rs 600.00')).toBeOnTheScreen();
  expect(screen.getByText('You')).toBeOnTheScreen();
  expect(
    screen.queryByRole('button', { name: 'Landlord returns the deposit' }),
  ).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Undo the latest change' })).not.toBeOnTheScreen();
});

it('lets an admin undo the latest change after confirming', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<DepositDetail apartmentId={APARTMENT} depositId={DEPOSIT} />);

  await user.press(await screen.findByRole('button', { name: 'Undo the latest change' }));
  await user.press(await screen.findByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(undoDepositAction).toHaveBeenCalledWith('r', expect.any(String)));
});

it('records a deposit with who paid and the shares', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<RecordDeposit apartmentId={APARTMENT} />);

  await user.type(await screen.findByLabelText('Deposit in PKR'), '900');
  await user.press(screen.getByRole('button', { name: 'Record deposit' }));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [, recorded] = jest.mocked(recordDeposit).mock.calls[0];
  expect(recorded).toMatchObject({
    title: 'Security deposit',
    amountMinor: 90_000,
    payers: [{ userId: ANAS, amountMinor: 90_000 }],
    splitMethod: 'equal',
  });
  expect(recorded.participants).toHaveLength(3);
});

it('records a takeover of a whole share', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<TakeOverShare apartmentId={APARTMENT} depositId={DEPOSIT} />);

  await user.press(await screen.findByRole('button', { name: 'Zubair (Rs 300.00)' }));
  await user.press(screen.getByRole('button', { name: 'Wali' }));
  await user.press(screen.getByRole('button', { name: 'Record takeover' }));

  await waitFor(() =>
    expect(jest.mocked(takeOverDepositShare).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        depositId: DEPOSIT,
        fromId: ZUBAIR,
        toId: WALI,
        amountMinor: 30_000,
      }),
    ),
  );
});

it('previews a return with deductions shared by share, then records it', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<ReturnDeposit apartmentId={APARTMENT} depositId={DEPOSIT} />);

  await user.press(await screen.findByRole('button', { name: 'You' }));
  await user.press(screen.getByRole('button', { name: 'Add a deduction' }));
  await user.type(screen.getByLabelText('Deduction 1 amount in PKR'), '100.01');
  await user.type(screen.getByLabelText('Deduction 1 reason'), 'Cleaning');

  expect(screen.getByLabelText('Returned in PKR')).toHaveDisplayValue('499.99');
  expect(screen.getByText('Rs 249.99 (Rs 50.01 kept)')).toBeOnTheScreen();
  expect(screen.getByText('Rs 250.00 (Rs 50.00 kept)')).toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Record return' }));
  await waitFor(() =>
    expect(jest.mocked(returnDeposit).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        receivedBy: ANAS,
        refundedMinor: 49_999,
        deductions: [{ amountMinor: 10_001, reason: 'Cleaning' }],
      }),
    ),
  );
});
