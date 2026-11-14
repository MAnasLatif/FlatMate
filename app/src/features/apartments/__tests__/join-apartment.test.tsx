import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderWithProviders } from '@/test/render';

import { joinApartment } from '../api';
import { JoinApartment } from '../components/join-apartment';

const FLAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/features/auth/session-provider', () => ({
  useCurrentUserId: () => '11111111-1111-1111-1111-111111111111',
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  joinApartment: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

async function enterCode(code: string) {
  await renderWithProviders(<JoinApartment />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Join code'), code);
  await user.press(screen.getByRole('button', { name: 'Join' }));
}

describe('JoinApartment', () => {
  it('joins with the code, written any way, and opens the apartment', async () => {
    jest.mocked(joinApartment).mockResolvedValue({ status: 'joined', apartment_id: FLAT });

    await enterCode('7kq2 m9xd');

    expect(jest.mocked(joinApartment).mock.calls[0][0]).toBe('7KQ2M9XD');
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/apartments/[apartmentId]',
      params: { apartmentId: FLAT },
    });
  });

  it('says how to fix a code that does not work', async () => {
    jest.mocked(joinApartment).mockResolvedValue({ status: 'invalid_code' });

    await enterCode('7KQ2-M9XD');

    expect(await screen.findByText(/This code does not work/)).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('checks the code length before sending it', async () => {
    await enterCode('7KQ2');

    expect(await screen.findByText(/A join code has 8 letters and digits/)).toBeOnTheScreen();
    expect(joinApartment).not.toHaveBeenCalled();
  });
});
