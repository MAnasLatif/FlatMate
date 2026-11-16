import { screen, userEvent } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

import { renderWithProviders } from '@/test/render';

import { createInvite, sendInviteEmail } from '../api';
import { useState } from 'react';

import { AddMemberButton, AddMemberSheet } from '../components/add-member-button';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  createInvite: jest.fn(),
  sendInviteEmail: jest.fn(),
}));

const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const sendEmail = jest.mocked(sendInviteEmail);
const create = jest.mocked(createInvite);

function Harness() {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <AddMemberButton onPress={() => setOpen(true)} />
      <AddMemberSheet
        apartmentId={APARTMENT}
        apartmentName="Flat 4B"
        isOpen={isOpen}
        onOpenChange={setOpen}
      />
    </>
  );
}

async function openSheet() {
  await renderWithProviders(<Harness />);
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Add member' }));
  return user;
}

beforeEach(() => {
  jest.clearAllMocks();
  sendEmail.mockResolvedValue(undefined);
  create.mockResolvedValue('ABCD-2345');
});

it('emails an invite to the address typed, trimmed and in lower case', async () => {
  const user = await openSheet();

  await user.type(screen.getByPlaceholderText('friend@example.com'), ' Friend@Example.com ');
  await user.press(screen.getByRole('button', { name: 'Send invite' }));

  expect(sendEmail).toHaveBeenCalledWith(APARTMENT, 'friend@example.com');
  expect(await screen.findByText('Invite sent to friend@example.com.')).toBeOnTheScreen();
});

it('asks for a valid address before sending anything', async () => {
  const user = await openSheet();

  await user.type(screen.getByPlaceholderText('friend@example.com'), 'not-an-address');
  await user.press(screen.getByRole('button', { name: 'Send invite' }));

  expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen();
  expect(sendEmail).not.toHaveBeenCalled();
});

it('says why an email was refused', async () => {
  sendEmail.mockRejectedValue(new Error('rate_limited'));
  const user = await openSheet();

  await user.type(screen.getByPlaceholderText('friend@example.com'), 'friend@example.com');
  await user.press(screen.getByRole('button', { name: 'Send invite' }));

  expect(
    await screen.findByText(
      'Too many invites have been emailed today. Try again tomorrow, or share a code.',
    ),
  ).toBeOnTheScreen();
});

it('copies and shares one code, created the first time it is needed', async () => {
  const share = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  const user = await openSheet();
  const message = 'Join Flat 4B on FlatMate with this code: ABCD-2345. It works for 7 days.';

  await user.press(screen.getByRole('button', { name: 'Copy invite' }));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(message);
  expect(await screen.findByText('Copied')).toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Share invite' }));
  expect(share).toHaveBeenCalledWith({ message });
  expect(create).toHaveBeenCalledTimes(1);
});
