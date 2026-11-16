import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { fetchUnreadNotifications } from '@/features/notifications/api';
import type { UnreadNotification } from '@/features/notifications/unread';
import { renderWithProviders } from '@/test/render';

import { type Apartment, fetchApartment, fetchMyApartments, type MyApartment } from '../api';
import { ApartmentSwitcher } from '../components/apartment-switcher';

const FLAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchApartment: jest.fn(),
  fetchMyApartments: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('@/features/notifications/api', () => ({
  ...jest.requireActual('@/features/notifications/api'),
  fetchUnreadNotifications: jest.fn(),
}));

const mine = (id: string) => ({ role: 'member', apartment: { id, name: id } }) as MyApartment;
const unreadIn = (apartmentId: string): UnreadNotification => ({
  id: `n-${apartmentId}`,
  apartmentId,
  recordType: 'expense',
  recordId: 'e1',
  expenseId: null,
  counterpartyId: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchApartment).mockResolvedValue({ id: FLAT, name: 'Flat 4B' } as Apartment);
  jest.mocked(fetchMyApartments).mockResolvedValue([mine(FLAT), mine(OTHER)]);
  jest.mocked(fetchUnreadNotifications).mockResolvedValue([]);
});

describe('ApartmentSwitcher', () => {
  it('shows FlatMate with the apartment under it, and opens the list when tapped', async () => {
    await renderWithProviders(<ApartmentSwitcher apartmentId={FLAT} />);

    expect(screen.getByText('FlatMate')).toBeOnTheScreen();
    expect(await screen.findByText('Flat 4B')).toBeOnTheScreen();

    await userEvent
      .setup()
      .press(screen.getByRole('button', { name: 'Flat 4B. Switch apartment' }));
    expect(router.push).toHaveBeenCalledWith('/apartments');
  });

  it('shows a red dot when another apartment has something new', async () => {
    jest.mocked(fetchUnreadNotifications).mockResolvedValue([unreadIn(OTHER)]);
    await renderWithProviders(<ApartmentSwitcher apartmentId={FLAT} />);

    expect(
      await screen.findByRole('button', { name: 'Flat 4B. Switch apartment, 1 new' }),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('unread-badge', { includeHiddenElements: true })).toHaveTextContent(
      '1',
    );
  });

  it('leaves out what is new in the open apartment, which shows its own dots', async () => {
    jest.mocked(fetchUnreadNotifications).mockResolvedValue([unreadIn(FLAT)]);
    await renderWithProviders(<ApartmentSwitcher apartmentId={FLAT} />);

    expect(await screen.findByText('Flat 4B')).toBeOnTheScreen();
    expect(screen.queryByTestId('unread-badge', { includeHiddenElements: true })).toBeNull();
  });
});
