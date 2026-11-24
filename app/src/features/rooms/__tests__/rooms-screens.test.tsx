import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { useState } from 'react';

import {
  type Apartment,
  fetchApartment,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { type ExpenseDraft, newDraft } from '@/features/expenses/draft';
import { renderWithProviders } from '@/test/render';

import {
  addRoomOccupant,
  endRoomOccupancy,
  fetchRooms,
  fetchRoomSplit,
  type RoomsData,
  saveRoom,
} from '../api';
import { RoomDetail } from '../components/room-detail';
import { RoomFormScreen } from '../components/room-form';
import { RoomList } from '../components/room-list';
import { RoomSplitPanel } from '../components/room-split-panel';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const WALI = '44444444-4444-4444-4444-444444444444';
const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
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
  fetchRooms: jest.fn(),
  saveRoom: jest.fn(),
  addRoomOccupant: jest.fn(),
  endRoomOccupancy: jest.fn(),
  fetchRoomSplit: jest.fn(),
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

const members = [member(ANAS, 'Anas', 'admin'), member(ZUBAIR, 'Zubair')];

const roomsData: RoomsData = {
  rooms: [
    { id: 'master', name: 'Master', weight: 3, archivedAt: null },
    { id: 'small', name: 'Small', weight: 2, archivedAt: null },
  ],
  occupancies: [
    { id: 'anas-master', roomId: 'master', userId: ANAS, startsOn: '2020-01-01', endsOn: null },
    { id: 'zubair-small', roomId: 'small', userId: ZUBAIR, startsOn: '2020-01-01', endsOn: null },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = ANAS;
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest.mocked(fetchMembers).mockResolvedValue(members);
  jest.mocked(fetchRooms).mockResolvedValue(roomsData);
  jest.mocked(saveRoom).mockResolvedValue('room-1');
  jest.mocked(addRoomOccupant).mockResolvedValue('stay-1');
  jest.mocked(endRoomOccupancy).mockResolvedValue();
  jest.mocked(fetchRoomSplit).mockResolvedValue([
    { userId: ANAS, amountMinor: 180_000, days: 30, included: true },
    { userId: ZUBAIR, amountMinor: 120_000, days: 30, included: true },
    { userId: WALI, amountMinor: 0, days: 10, included: false },
  ]);
});

it('lists the rooms with who lives in each, and lets an admin add one', async () => {
  await renderWithProviders(<RoomList apartmentId={APARTMENT} />);
  expect(await screen.findByRole('button', { name: 'Master, weight 3, You' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Small, weight 2, Zubair' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Add a room' })).toBeOnTheScreen();
});

it('shows a member the rooms without changing them', async () => {
  mockCurrentUser = ZUBAIR;
  await renderWithProviders(<RoomList apartmentId={APARTMENT} />);
  await screen.findByText('Master');
  expect(screen.queryByRole('button', { name: 'Add a room' })).not.toBeOnTheScreen();
});

it('adds a room with its weight', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<RoomFormScreen apartmentId={APARTMENT} />);

  await user.type(await screen.findByLabelText('Room name'), 'Box room');
  await user.clear(screen.getByLabelText('Room weight'));
  await user.type(screen.getByLabelText('Room weight'), '2');
  await user.press(screen.getByRole('button', { name: 'Add room' }));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [apartmentId, room, options] = jest.mocked(saveRoom).mock.calls[0];
  expect(apartmentId).toBe(APARTMENT);
  expect(room).toEqual({ name: 'Box room', weight: 2 });
  expect(options.requestId).toEqual(expect.any(String));
});

it('lets an admin record who moved in and who moved out', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<RoomDetail apartmentId={APARTMENT} roomId="small" />);

  await user.press(await screen.findByRole('button', { name: 'Moved out' }));
  await user.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(jest.mocked(endRoomOccupancy).mock.calls[0]?.[0]).toEqual({
      occupancyId: 'zubair-small',
      endsOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }),
  );

  await user.press(screen.getByRole('button', { name: 'Add someone' }));
  await user.press(screen.getByRole('button', { name: 'You' }));
  await user.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(jest.mocked(addRoomOccupant).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ roomId: 'small', userId: ANAS, endsOn: null }),
    ),
  );
});

it('hides the room changes from a member', async () => {
  mockCurrentUser = ZUBAIR;
  await renderWithProviders(<RoomDetail apartmentId={APARTMENT} roomId="small" />);
  await screen.findByText('Who lived here');
  expect(screen.queryByRole('button', { name: 'Moved out' })).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Add someone' })).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Edit room' })).not.toBeOnTheScreen();
});

function PanelHarness() {
  const [draft, setDraft] = useState<ExpenseDraft>(() => ({
    ...newDraft(ANAS, '2026-11-30'),
    amount: '3000',
  }));
  return (
    <>
      <RoomSplitPanel
        apartmentId={APARTMENT}
        draft={draft}
        setDraft={setDraft}
        members={members}
        currentUserId={ANAS}
        currency="PKR"
        today="2026-11-30"
      />
      <Text>{`method:${draft.splitMethod}`}</Text>
      <Text>{`amounts:${JSON.stringify(draft.fixedAmounts)}`}</Text>
    </>
  );
}

it('works out a split by room for the month and fills it in', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<PanelHarness />);

  await user.press(await screen.findByRole('button', { name: 'Split by room…' }));
  await user.press(screen.getByRole('button', { name: 'Work it out' }));

  await waitFor(() =>
    expect(fetchRoomSplit).toHaveBeenCalledWith(APARTMENT, 300_000, '2026-11-01', '2026-11-30'),
  );
  expect(await screen.findByText('Rs 1,800.00')).toBeOnTheScreen();
  expect(
    screen.getByText(/lived in a room for 10 days of this period but has left/),
  ).toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Use this split' }));
  expect(screen.getByText('method:fixed')).toBeOnTheScreen();
  expect(
    screen.getByText(`amounts:${JSON.stringify({ [ANAS]: '1800.00', [ZUBAIR]: '1200.00' })}`),
  ).toBeOnTheScreen();
});

it('offers no room split in a flat without rooms', async () => {
  jest.mocked(fetchRooms).mockResolvedValue({ rooms: [], occupancies: [] });
  await renderWithProviders(<PanelHarness />);
  await waitFor(() => expect(fetchRooms).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Split by room…' })).not.toBeOnTheScreen();
});
