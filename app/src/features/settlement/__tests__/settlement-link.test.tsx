import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useHasUnread } from '@/features/notifications/hooks';
import { renderWithProviders } from '@/test/render';

import { SettlementLink } from '../components/settlement-link';

const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/features/notifications/hooks', () => ({ useHasUnread: jest.fn(() => false) }));

beforeEach(() => jest.clearAllMocks());

describe('SettlementLink', () => {
  it('opens the settlement screen of the apartment', async () => {
    await renderWithProviders(<SettlementLink apartmentId={APARTMENT} />);

    await userEvent.setup().press(screen.getByRole('button', { name: 'Settlement' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]/settlement',
      params: { apartmentId: APARTMENT },
    });
    expect(screen.queryByTestId('unread-dot', { includeHiddenElements: true })).toBeNull();
  });

  it('shows a dot when a payment, offset or closed period is unread', async () => {
    jest.mocked(useHasUnread).mockReturnValue(true);
    await renderWithProviders(<SettlementLink apartmentId={APARTMENT} />);

    expect(screen.getByRole('button', { name: 'Settlement, new' })).toBeOnTheScreen();
    expect(screen.getByTestId('unread-dot', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
