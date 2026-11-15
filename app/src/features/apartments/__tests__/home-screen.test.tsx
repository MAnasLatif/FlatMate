import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen } from '@testing-library/react-native';

import HomeScreen from '@/app/(app)/(home)/index';
import { renderWithProviders } from '@/test/render';

import { fetchMyApartments, type MyApartment } from '../api';

const ME = '11111111-1111-1111-1111-111111111111';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    // Shows where it would go, so the test can read it.
    Redirect: ({ href }: { href: { params: { apartmentId: string } } }) => (
      <Text>{`opens ${href.params.apartmentId}`}</Text>
    ),
  };
});
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

const apartment = (id: string): MyApartment =>
  ({
    role: 'member',
    canAddExpense: true,
    apartment: { id, name: id, location: null, show_location: false, currency: 'PKR' },
  }) as MyApartment;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('HomeScreen', () => {
  it('opens the apartment the user last opened', async () => {
    jest.mocked(fetchMyApartments).mockResolvedValue([apartment('flat-a'), apartment('flat-b')]);
    await AsyncStorage.setItem(`flatmate.last-apartment.${ME}`, 'flat-b');

    await renderWithProviders(<HomeScreen />);

    expect(await screen.findByText('opens flat-b')).toBeOnTheScreen();
  });

  it('opens the first apartment when the last one was left', async () => {
    jest.mocked(fetchMyApartments).mockResolvedValue([apartment('flat-a')]);
    await AsyncStorage.setItem(`flatmate.last-apartment.${ME}`, 'gone');

    await renderWithProviders(<HomeScreen />);

    expect(await screen.findByText('opens flat-a')).toBeOnTheScreen();
  });

  it('shows how to join or create when the user has no apartment', async () => {
    jest.mocked(fetchMyApartments).mockResolvedValue([]);

    await renderWithProviders(<HomeScreen />);

    expect(await screen.findByText('Join your flat')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create new apartment' })).toBeOnTheScreen();
  });
});
