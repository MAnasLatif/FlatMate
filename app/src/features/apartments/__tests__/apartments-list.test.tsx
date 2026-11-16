import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import MyApartmentsScreen from '@/app/(app)/apartments/index';
import { renderWithProviders } from '@/test/render';

import { fetchMyApartments, type MyApartment } from '../api';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
}));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('@/features/settlement/components/past-apartments', () => ({
  PastApartments: () => null,
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchMyApartments: jest.fn(),
  fetchMyJoinRequests: jest.fn(async () => []),
}));

const apartment = (id: string, role: 'admin' | 'member'): MyApartment =>
  ({
    role,
    canAddExpense: true,
    apartment: { id, name: `Flat ${id}`, location: null, show_location: false, currency: 'PKR' },
  }) as MyApartment;

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(fetchMyApartments)
    .mockResolvedValue([apartment('A', 'admin'), apartment('B', 'member')]);
});

describe('Your apartments', () => {
  it('shows settings only beside apartments the user runs', async () => {
    await renderWithProviders(<MyApartmentsScreen />);

    await userEvent
      .setup()
      .press(await screen.findByRole('button', { name: 'Settings for Flat A' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/settings',
      params: { apartmentId: 'A' },
    });
    expect(screen.queryByRole('button', { name: 'Settings for Flat B' })).not.toBeOnTheScreen();
    expect(screen.queryByText('Admin')).not.toBeOnTheScreen();
  });

  it('opens the chosen apartment in place of the one it was opened from', async () => {
    await renderWithProviders(<MyApartmentsScreen />);

    await userEvent.setup().press(await screen.findByRole('button', { name: 'Open Flat B' }));

    expect(router.dismissAll).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]',
      params: { apartmentId: 'B' },
    });
  });
});
