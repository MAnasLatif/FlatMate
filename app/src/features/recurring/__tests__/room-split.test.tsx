import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { fetchRooms } from '@/features/rooms/api';
import { renderWithProviders } from '@/test/render';

import {
  createTemplate,
  fetchTemplates,
  fetchWaitingBills,
  postBill,
  type RecurringTemplate,
} from '../api';
import { EnterBillScreen } from '../components/enter-bill-screen';
import { TemplateScreen } from '../components/template-screen';

const FLAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ME = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({ useCurrentUserId: () => ME }));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
}));
jest.mock('@/features/rooms/api', () => ({
  ...jest.requireActual('@/features/rooms/api'),
  fetchRooms: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchTemplates: jest.fn(),
  fetchWaitingBills: jest.fn(),
  createTemplate: jest.fn(),
  postBill: jest.fn(),
}));

const apartment: Apartment = {
  id: FLAT,
  name: 'Flat 4B',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  settlement_day: 1,
  approval_days: 7,
  due_reminder_days: 1,
  settlement_reminder_days: 2,
  location: null,
  show_location: false,
  created_by: ME,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

function member(userId: string, displayName: string, role: Member['role']): Member {
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

const electricity: RecurringTemplate = {
  id: 't-power',
  title: 'Electricity',
  kind: 'variable',
  amountMinor: null,
  repeat: 'monthly',
  billDay: 5,
  dueAfterDays: null,
  collectorId: null,
  splitMethod: 'room',
  participants: [],
  roomPeriod: 'arrears',
  nextBillDate: '2027-01-05',
  isPaused: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest
    .mocked(fetchMembers)
    .mockResolvedValue([member(ME, 'Anas', 'admin'), member(ZUBAIR, 'Zubair', 'member')]);
  jest.mocked(fetchRooms).mockResolvedValue({
    rooms: [{ id: 'master', name: 'Master', weight: 3, archivedAt: null }],
    occupancies: [],
  });
  jest.mocked(fetchTemplates).mockResolvedValue([electricity]);
  jest
    .mocked(fetchWaitingBills)
    .mockResolvedValue([
      { id: 'bill-1', billDate: '2026-12-05', reason: 'amount_needed', template: electricity },
    ]);
  jest.mocked(createTemplate).mockResolvedValue('t-new');
  jest.mocked(postBill).mockResolvedValue('expense-1');
});

it('sets up rent split by room in advance', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<TemplateScreen apartmentId={FLAT} templateId={null} />);

  await user.type(await screen.findByLabelText('What is it for?'), 'Rent');
  await user.type(screen.getByLabelText('Amount in PKR'), '3000');
  await user.press(await screen.findByRole('switch', { name: 'Split by room each time' }));
  expect(screen.getByText(/from its bill date to the day before the next/)).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Add repeatable expense' }));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [, value] = jest.mocked(createTemplate).mock.calls[0];
  expect(value).toMatchObject({
    title: 'Rent',
    amountMinor: 300_000,
    splitMethod: 'room',
    participants: [],
    roomPeriod: 'advance',
  });
});

it('offers no split by room in a flat without rooms', async () => {
  jest.mocked(fetchRooms).mockResolvedValue({ rooms: [], occupancies: [] });
  await renderWithProviders(<TemplateScreen apartmentId={FLAT} templateId={null} />);
  await screen.findByLabelText('What is it for?');
  await waitFor(() => expect(fetchRooms).toHaveBeenCalled());
  expect(screen.queryByRole('switch', { name: 'Split by room each time' })).not.toBeOnTheScreen();
});

it('enters a bill split by room, which the server shares for the month before', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<EnterBillScreen apartmentId={FLAT} instanceId="bill-1" />);

  expect(await screen.findByRole('switch', { name: 'Split by room' })).toBeOnTheScreen();
  // The switch reads its description out as its hint.
  expect(
    screen.getByText(/from Nov 5, 2026 to Dec 4, 2026/, { includeHiddenElements: true }),
  ).toBeOnTheScreen();
  await user.type(screen.getByLabelText('Amount in PKR'), '100');
  await user.press(screen.getByRole('button', { name: 'Charge the bill' }));

  await waitFor(() =>
    expect(jest.mocked(postBill).mock.calls[0]?.[1]).toMatchObject({
      amountMinor: 10_000,
      splitMethod: 'room',
      participants: [],
    }),
  );
});
