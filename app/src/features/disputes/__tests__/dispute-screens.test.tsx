import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { fetchMembers, type Member } from '@/features/apartments/api';
import { type ExpenseDetail, fetchExpenseDetail } from '@/features/expenses/api';
import { renderWithProviders } from '@/test/render';

import {
  decideDispute,
  type Dispute,
  type DisputeDetail,
  fetchDisputeDetail,
  fetchExpenseDisputes,
  raiseDispute,
  respondToDispute,
  withdrawDispute,
} from '../api';
import { DisputeDetailView } from '../components/dispute-detail';
import { ExpenseDisputes } from '../components/expense-disputes';
import { RaiseDispute } from '../components/raise-dispute';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const AJMAL = '33333333-3333-3333-3333-333333333333';
const KAMRAN = '55555555-5555-5555-5555-555555555555';
let mockCurrentUser = ANAS;

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({ useCurrentUserId: () => mockCurrentUser }));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchMembers: jest.fn(),
}));
jest.mock('@/features/expenses/api', () => ({
  ...jest.requireActual('@/features/expenses/api'),
  fetchExpenseDetail: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchExpenseDisputes: jest.fn(),
  fetchDisputeDetail: jest.fn(),
  raiseDispute: jest.fn(),
  respondToDispute: jest.fn(),
  withdrawDispute: jest.fn(),
  decideDispute: jest.fn(),
}));

const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EXPENSE = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const DISPUTE = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function member(userId: string, displayName: string, role: Member['role'] = 'member'): Member {
  return {
    membershipId: `m-${userId}`,
    userId,
    role,
    canAddExpense: true,
    joinedAt: '2026-11-01T00:00:00Z',
    leftAt: null,
    leftReason: null,
    displayName,
    avatarPath: null,
  };
}

/** Rs 300 of groceries Zubair paid for Anas, Zubair and Ajmal. */
const groceries: ExpenseDetail = {
  id: EXPENSE,
  apartmentId: APARTMENT,
  title: 'Groceries',
  description: null,
  categoryId: null,
  categoryName: null,
  amountMinor: 30_000,
  currency: 'PKR',
  expenseDate: '2026-11-13',
  dueDate: null,
  paidStatus: 'paid',
  status: 'provisional',
  revision: 1,
  finalizeAfter: '2026-11-20T19:00:00Z',
  finalizedAt: null,
  createdBy: ZUBAIR,
  createdAt: '2026-11-13T10:00:00Z',
  splitMethod: 'equal',
  splits: [
    { userId: ANAS, amountMinor: 10_000, basisPoints: null },
    { userId: ZUBAIR, amountMinor: 10_000, basisPoints: null },
    { userId: AJMAL, amountMinor: 10_000, basisPoints: null },
  ],
  payers: [{ userId: ZUBAIR, amountMinor: 30_000 }],
  history: [],
};

/** Anas proposes Rs 50 instead of Rs 100. */
const dispute: Dispute = {
  id: DISPUTE,
  apartmentId: APARTMENT,
  expenseId: EXPENSE,
  expenseRevision: 1,
  kind: 'adjustment',
  raisedBy: ANAS,
  reason: 'I was away for half of it',
  proposedShareMinor: 5000,
  isLate: false,
  state: 'open',
  resolution: null,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: '2026-11-14T10:00:00Z',
};

function detailOf(overrides: Partial<Dispute> = {}): DisputeDetail {
  return {
    dispute: { ...dispute, ...overrides },
    events: [
      {
        id: 1,
        actorId: ANAS,
        action: 'raised',
        message: dispute.reason,
        details: {},
        createdAt: '2026-11-14T10:00:00Z',
      },
    ],
    evidence: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = ANAS;
  jest.mocked(fetchExpenseDetail).mockResolvedValue(groceries);
  jest
    .mocked(fetchMembers)
    .mockResolvedValue([
      member(ANAS, 'Anas'),
      member(ZUBAIR, 'Zubair'),
      member(AJMAL, 'Ajmal'),
      member(KAMRAN, 'Kamran', 'admin'),
    ]);
  jest.mocked(fetchExpenseDisputes).mockResolvedValue([]);
  jest.mocked(fetchDisputeDetail).mockResolvedValue(detailOf());
});

describe('RaiseDispute', () => {
  it('raises a decline with its reason and opens the dispute (FR-05.2)', async () => {
    jest.mocked(raiseDispute).mockResolvedValue(DISPUTE);
    await renderWithProviders(<RaiseDispute apartmentId={APARTMENT} expenseId={EXPENSE} />);
    const user = userEvent.setup();

    expect(await screen.findByText(/the whole expense is held/)).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Why you object'), 'I was travelling');
    await user.press(screen.getByRole('button', { name: 'Raise dispute' }));

    expect(raiseDispute).toHaveBeenCalledWith(
      expect.objectContaining({
        expenseId: EXPENSE,
        kind: 'decline',
        proposedShareMinor: 0,
        reason: 'I was travelling',
      }),
    );
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/disputes/[disputeId]',
      params: { apartmentId: APARTMENT, disputeId: DISPUTE },
    });
  });

  it('previews the split a proposed share would produce', async () => {
    await renderWithProviders(<RaiseDispute apartmentId={APARTMENT} expenseId={EXPENSE} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'My share should be different' }));
    await user.type(screen.getByLabelText('Your fair share, in PKR'), '50');
    await user.type(screen.getByLabelText('Why you object'), 'Half');

    expect(await screen.findByText('If Zubair accepts')).toBeOnTheScreen();
    expect(screen.getByText('50.00 PKR')).toBeOnTheScreen();
    expect(screen.getAllByText('125.00 PKR')).toHaveLength(2);
  });

  it('does not let the person who added the expense dispute it', async () => {
    mockCurrentUser = ZUBAIR;
    await renderWithProviders(<RaiseDispute apartmentId={APARTMENT} expenseId={EXPENSE} />);

    expect(await screen.findByText('You cannot dispute this expense.')).toBeOnTheScreen();
  });
});

describe('DisputeDetailView', () => {
  it('lets the creator accept after confirming (FR-05.3)', async () => {
    mockCurrentUser = ZUBAIR;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Accept')?.onPress?.();
    });
    jest.mocked(respondToDispute).mockResolvedValue(undefined);
    await renderWithProviders(<DisputeDetailView apartmentId={APARTMENT} disputeId={DISPUTE} />);
    const user = userEvent.setup();

    expect(
      await screen.findByText('Anas: Proposes a share of 50.00 PKR instead of 100.00 PKR.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('If the proposal is applied')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Accept' }));

    expect(respondToDispute).toHaveBeenCalledWith(DISPUTE, true, null);
  });

  it('asks the creator for a message before rejecting', async () => {
    mockCurrentUser = ZUBAIR;
    jest.mocked(respondToDispute).mockResolvedValue(undefined);
    await renderWithProviders(<DisputeDetailView apartmentId={APARTMENT} disputeId={DISPUTE} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Reject' }));
    expect(screen.getByText('Write a short message to explain.')).toBeOnTheScreen();
    expect(respondToDispute).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Message'), 'You had the biryani');
    await user.press(screen.getByRole('button', { name: 'Reject' }));
    expect(respondToDispute).toHaveBeenCalledWith(DISPUTE, false, 'You had the biryani');
  });

  it('lets the raiser withdraw, and nothing else', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Withdraw')?.onPress?.();
    });
    jest.mocked(withdrawDispute).mockResolvedValue(undefined);
    await renderWithProviders(<DisputeDetailView apartmentId={APARTMENT} disputeId={DISPUTE} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Withdraw dispute' }));
    expect(withdrawDispute).toHaveBeenCalledWith(DISPUTE);
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeOnTheScreen();
  });

  it('lets an admin with no part in it decide an escalated dispute', async () => {
    mockCurrentUser = KAMRAN;
    jest.mocked(fetchDisputeDetail).mockResolvedValue(detailOf({ state: 'escalated' }));
    jest.mocked(decideDispute).mockResolvedValue(undefined);
    await renderWithProviders(<DisputeDetailView apartmentId={APARTMENT} disputeId={DISPUTE} />);
    const user = userEvent.setup();

    expect(await screen.findByText('Waiting for an admin')).toBeOnTheScreen();
    await user.type(
      screen.getByLabelText('Reason for your decision'),
      'Receipts show three plates',
    );
    await user.press(screen.getByRole('button', { name: 'Keep the expense as it is' }));

    expect(decideDispute).toHaveBeenCalledWith(DISPUTE, false, 'Receipts show three plates');
  });

  it('shows a resolved dispute with no actions', async () => {
    mockCurrentUser = AJMAL;
    jest
      .mocked(fetchDisputeDetail)
      .mockResolvedValue(detailOf({ state: 'resolved', resolution: 'withdrawn' }));
    await renderWithProviders(<DisputeDetailView apartmentId={APARTMENT} disputeId={DISPUTE} />);

    expect(await screen.findByText('Withdrawn')).toBeOnTheScreen();
    expect(screen.getByText('Anas raised this dispute')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Choose photo' })).not.toBeOnTheScreen();
  });
});

describe('ExpenseDisputes', () => {
  it('lists the disputes and offers to raise one to someone in the split', async () => {
    jest
      .mocked(fetchExpenseDisputes)
      .mockResolvedValue([{ ...dispute, state: 'resolved', resolution: 'upheld' }]);
    mockCurrentUser = AJMAL;
    await renderWithProviders(<ExpenseDisputes apartmentId={APARTMENT} expenseId={EXPENSE} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Dispute by Anas, Upheld' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/disputes/[disputeId]',
      params: { apartmentId: APARTMENT, disputeId: DISPUTE },
    });

    await user.press(screen.getByRole('button', { name: 'Dispute this expense' }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/apartments/[apartmentId]/expenses/[expenseId]/dispute',
      params: { apartmentId: APARTMENT, expenseId: EXPENSE },
    });
  });

  it('does not offer the person who added the expense to dispute it', async () => {
    jest.mocked(fetchExpenseDisputes).mockResolvedValue([dispute]);
    mockCurrentUser = ZUBAIR;
    await renderWithProviders(<ExpenseDisputes apartmentId={APARTMENT} expenseId={EXPENSE} />);

    expect(
      await screen.findByRole('button', { name: 'Dispute by Anas, Disputed' }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Dispute this expense' })).not.toBeOnTheScreen();
  });
});
