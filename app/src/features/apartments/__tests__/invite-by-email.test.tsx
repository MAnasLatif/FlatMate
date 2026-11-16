import { screen, userEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/render';

import { sendInviteEmail } from '../api';
import { InviteByEmail } from '../components/invite-by-email';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  sendInviteEmail: jest.fn(),
}));

const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const sendEmail = jest.mocked(sendInviteEmail);

async function renderInvite() {
  await renderWithProviders(<InviteByEmail apartmentId={APARTMENT} />);
  return userEvent.setup();
}

beforeEach(() => {
  jest.clearAllMocks();
  sendEmail.mockResolvedValue(undefined);
});

it('emails an invite to the address typed, trimmed and in lower case', async () => {
  const user = await renderInvite();

  await user.type(screen.getByPlaceholderText('friend@example.com'), ' Friend@Example.com ');
  await user.press(screen.getByRole('button', { name: 'Send invite' }));

  expect(sendEmail).toHaveBeenCalledWith(APARTMENT, 'friend@example.com');
  expect(await screen.findByText('Invite sent to friend@example.com.')).toBeOnTheScreen();
});

it('asks for a valid address before sending anything', async () => {
  const user = await renderInvite();

  await user.type(screen.getByPlaceholderText('friend@example.com'), 'not-an-address');
  await user.press(screen.getByRole('button', { name: 'Send invite' }));

  expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen();
  expect(sendEmail).not.toHaveBeenCalled();
});

it('says why an email was refused', async () => {
  sendEmail.mockRejectedValue(new Error('rate_limited'));
  const user = await renderInvite();

  await user.type(screen.getByPlaceholderText('friend@example.com'), 'friend@example.com');
  await user.press(screen.getByRole('button', { name: 'Send invite' }));

  expect(
    await screen.findByText(
      'Too many invites have been emailed today. Try again tomorrow, or share a code.',
    ),
  ).toBeOnTheScreen();
});
