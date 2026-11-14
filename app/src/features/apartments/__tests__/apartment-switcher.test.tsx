import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderWithProviders } from '@/test/render';

import { type Apartment, fetchApartment } from '../api';
import { ApartmentSwitcher } from '../components/apartment-switcher';

const FLAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../api', () => ({ ...jest.requireActual('../api'), fetchApartment: jest.fn() }));

describe('ApartmentSwitcher', () => {
  it('shows FlatMate with the apartment under it, and opens the list when tapped', async () => {
    jest.mocked(fetchApartment).mockResolvedValue({ id: FLAT, name: 'Flat 4B' } as Apartment);
    await renderWithProviders(<ApartmentSwitcher apartmentId={FLAT} />);

    expect(screen.getByText('FlatMate')).toBeOnTheScreen();
    expect(await screen.findByText('Flat 4B')).toBeOnTheScreen();

    await userEvent
      .setup()
      .press(screen.getByRole('button', { name: 'Flat 4B. Switch apartment' }));
    expect(router.push).toHaveBeenCalledWith('/apartments');
  });
});
