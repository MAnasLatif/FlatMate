import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { type ExpenseDetail, fetchExpenseDetail, fetchPairBalances } from '@/features/expenses/api';
import { renderWithProviders } from '@/test/render';

import {
  declinePayment,
  fetchPairPaymentsPage,
  fetchPaymentDetail,
  netOff,
  type Payment,
  type PaymentDetail,
  recordPayment,
  voidPayment,
} from '../api';
import { ExpensePayActions } from '../components/expense-pay-actions';
import { PairPayments } from '../components/pair-payments';
import { PayMember } from '../components/pay-member';
import { PaymentDetailView } from '../components/payment-detail';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
let mockCurrentUser = ZUBAIR;

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({ useCurrentUserId: () => mockCurrentUser }));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
}));
jest.mock('@/features/expenses/api', () => ({
  ...jest.requireActual('@/features/expenses/api'),
  fetchPairBalances: jest.fn(),
  fetchExpenseDetail: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchPairPaymentsPage: jest.fn(),
  fetchPaymentDetail: jest.fn(),
  recordPayment: jest.fn(),
  netOff: jest.fn(),
  declinePayment: jest.fn(),
  voidPayment: jest.fn(),
}));

const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PAYMENT = 'pppppppp-pppp-pppp-pppp-pppppppppppp';

const apartment: Apartment = {
  id: APARTMENT,
  name: 'Flat 4B',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  settlement_day: 1,
  approval_days: 7,
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
    displayName,
    avatarPath: null,
  };
}

const amounts = (provisionalMinor = 0) => ({ finalMinor: 0, provisionalMinor, disputedMinor: 0 });

/** Zubair paid Anas Rs 120. */
const payment: Payment = {
  id: PAYMENT,
  apartmentId: APARTMENT,
  payerId: ZUBAIR,
  recipientId: ANAS,
  amountMinor: 12_000,
  currency: 'PKR',
  paidAt: '2026-11-13T10:00:00Z',
  reference: 'TXN-77',
  status: 'provisional',
  finalizeAfter: '2026-11-20T19:00:00Z',
  finalizedAt: null,
  expenseId: null,
  createdAt: '2026-11-13T10:00:00Z',
};

function detailOf(overrides: Partial<Payment> = {}): PaymentDetail {
  return { payment: { ...payment, ...overrides }, objections: [], proofs: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = ZUBAIR;
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest.mocked(fetchMembers).mockResolvedValue([member(ANAS, 'Anas'), member(ZUBAIR, 'Zubair')]);
  // Zubair owes Anas Rs 150, and Anas owes Zubair Rs 120.
  jest
    .mocked(fetchPairBalances)
    .mockResolvedValue([{ counterpartyId: ANAS, owe: amounts(15_000), owed: amounts(12_000) }]);
  jest.mocked(fetchPaymentDetail).mockResolvedValue(detailOf());
});

describe('PayMember', () => {
  it('records a partial payment with its reference (FR-07.3)', async () => {
    jest.mocked(recordPayment).mockResolvedValue(PAYMENT);
    await renderWithProviders(
      <PayMember apartmentId={APARTMENT} memberId={ANAS} expenseId={null} />,
    );
    const user = userEvent.setup();

    expect(await screen.findByText(/FlatMate does not move money/)).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Amount you paid, in PKR'), '100');
    await user.type(screen.getByLabelText('Transaction reference'), 'TXN-77');
    await user.press(screen.getByRole('button', { name: 'Record payment' }));

    expect(netOff).not.toHaveBeenCalled();
    expect(recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        apartmentId: APARTMENT,
        recipientId: ANAS,
        amountMinor: 10_000,
        paidAt: null,
        reference: 'TXN-77',
        expenseId: null,
      }),
    );
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/payments/[paymentId]',
      params: { apartmentId: APARTMENT, paymentId: PAYMENT },
    });
  });

  it('nets off first and pays the rest in net mode (FR-07.1, AC-09)', async () => {
    jest.mocked(netOff).mockResolvedValue('offset-id');
    jest.mocked(recordPayment).mockResolvedValue(PAYMENT);
    await renderWithProviders(
      <PayMember apartmentId={APARTMENT} memberId={ANAS} expenseId={null} />,
    );
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Net off first' }));
    expect(screen.getByText(/120.00 PKR is netted off both ways/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Record payment' }));

    expect(netOff).toHaveBeenCalledWith(APARTMENT, ANAS, 12_000, expect.any(String));
    expect(recordPayment).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 3000 }));
  });

  it('refuses more than is owed', async () => {
    await renderWithProviders(
      <PayMember apartmentId={APARTMENT} memberId={ANAS} expenseId={null} />,
    );
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Amount you paid, in PKR'), '151');
    await user.press(screen.getByRole('button', { name: 'Record payment' }));

    expect(screen.getByText('That is more than you owe.')).toBeOnTheScreen();
    expect(recordPayment).not.toHaveBeenCalled();
  });
});

describe('PaymentDetailView', () => {
  it('lets the recipient decline with a reason (FR-07.5)', async () => {
    mockCurrentUser = ANAS;
    jest.mocked(declinePayment).mockResolvedValue(undefined);
    await renderWithProviders(<PaymentDetailView apartmentId={APARTMENT} paymentId={PAYMENT} />);
    const user = userEvent.setup();

    expect(await screen.findByText('Recorded, provisional')).toBeOnTheScreen();
    expect(screen.getByText(/You can object until the end of/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Decline payment' }));
    expect(declinePayment).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Why you decline the payment'), 'Nothing arrived');
    await user.press(screen.getByRole('button', { name: 'Decline payment' }));
    expect(declinePayment).toHaveBeenCalledWith(PAYMENT, 'Nothing arrived');
  });

  it('lets the payer void it after confirming', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Void')?.onPress?.();
    });
    jest.mocked(voidPayment).mockResolvedValue(undefined);
    await renderWithProviders(<PaymentDetailView apartmentId={APARTMENT} paymentId={PAYMENT} />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Void this payment' }));
    expect(voidPayment).toHaveBeenCalledWith(PAYMENT);
    expect(screen.queryByRole('button', { name: 'Decline payment' })).not.toBeOnTheScreen();
  });

  it('says a final payment was confirmed by app policy, not a bank (FR-07.8)', async () => {
    jest.mocked(fetchPaymentDetail).mockResolvedValue(detailOf({ status: 'final' }));
    await renderWithProviders(<PaymentDetailView apartmentId={APARTMENT} paymentId={PAYMENT} />);

    expect(await screen.findByText('Confirmed by app policy')).toBeOnTheScreen();
    expect(screen.getByText(/No bank has verified it/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Void this payment' })).not.toBeOnTheScreen();
  });
});

describe('PairPayments', () => {
  it('lists payments between the two and offers to pay what is owed (FR-06.3)', async () => {
    jest.mocked(fetchPairPaymentsPage).mockResolvedValue([payment]);
    await renderWithProviders(
      <PairPayments apartmentId={APARTMENT} counterpartyId={ANAS} name="Anas" />,
    );
    const user = userEvent.setup();

    await user.press(
      await screen.findByRole('button', {
        name: 'You paid Anas 120.00 PKR, Recorded, provisional',
      }),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/payments/[paymentId]',
      params: { apartmentId: APARTMENT, paymentId: PAYMENT },
    });

    await user.press(screen.getByRole('button', { name: 'Pay Anas' }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/apartments/[apartmentId]/pay/[memberId]',
      params: { apartmentId: APARTMENT, memberId: ANAS },
    });
  });
});

describe('ExpensePayActions', () => {
  it('offers to pay whoever this expense makes the user owe', async () => {
    const groceries: ExpenseDetail = {
      id: 'e1',
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
      createdBy: ANAS,
      createdAt: '2026-11-13T10:00:00Z',
      splitMethod: 'equal',
      splits: [
        { userId: ANAS, amountMinor: 15_000, basisPoints: null },
        { userId: ZUBAIR, amountMinor: 15_000, basisPoints: null },
      ],
      payers: [{ userId: ANAS, amountMinor: 30_000 }],
      history: [],
    };
    jest.mocked(fetchExpenseDetail).mockResolvedValue(groceries);
    await renderWithProviders(<ExpensePayActions apartmentId={APARTMENT} expenseId="e1" />);
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Pay Anas' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/pay/[memberId]',
      params: { apartmentId: APARTMENT, memberId: ANAS, expenseId: 'e1' },
    });
  });
});
