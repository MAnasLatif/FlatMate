import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { AuthApiError } from '@supabase/supabase-js';

import { confirmEmailChangeCode, requestEmailChange } from '@/features/auth/api';
import { renderWithProviders } from '@/test/render';

import { ChangeEmail } from '../components/change-email';

const CURRENT = 'anas@example.com';
const NEW = 'new@example.com';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/features/auth/session-provider', () => ({
  useSession: () => ({ session: { user: { email: 'anas@example.com' } } }),
}));
jest.mock('@/features/auth/api', () => ({
  requestEmailChange: jest.fn(),
  resendEmailChangeCodes: jest.fn(),
  confirmEmailChangeCode: jest.fn(),
}));
// The countdown has its own tests; a ticking one would re-render the screen
// in the middle of the test's interactions.
jest.mock('@/features/auth/resend-countdown', () => ({
  ...jest.requireActual('@/features/auth/resend-countdown'),
  useResendCountdown: () => ({ remaining: 0, restart: jest.fn() }),
}));
// A plain input in place of the six-slot code input, so a test can enter a
// whole code at once.
jest.mock('@/features/auth/components/email-code-field', () => {
  const { Text, TextInput, View } = jest.requireActual('react-native');
  return {
    EmailCodeField: (props: {
      label: string;
      value: string;
      onChange: (code: string) => void;
      error?: string;
    }) => (
      <View>
        <TextInput
          accessibilityLabel={props.label}
          value={props.value}
          onChangeText={props.onChange}
        />
        {props.error ? <Text>{props.error}</Text> : null}
      </View>
    ),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.mocked(requestEmailChange).mockResolvedValue();
  jest.mocked(confirmEmailChangeCode).mockResolvedValue();
});

afterEach(() => {
  jest.useRealTimers();
});

const setUpUser = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

async function typeNewEmail(email: string) {
  await renderWithProviders(<ChangeEmail />);
  const user = setUpUser();
  await user.type(await screen.findByLabelText('New email'), email);
  await user.press(screen.getByRole('button', { name: 'Send codes' }));
  return user;
}

async function sendCodes() {
  const user = await typeNewEmail(` ${NEW.toUpperCase()} `);
  await screen.findByLabelText(`Code sent to ${NEW}`);
  return user;
}

function enterCodes(newCode: string, currentCode: string) {
  fireEvent.changeText(screen.getByLabelText(`Code sent to ${NEW}`), newCode);
  fireEvent.changeText(screen.getByLabelText(`Code sent to ${CURRENT}`), currentCode);
}

// Confirming the codes, including a partly failed attempt, is covered by
// email-change.test.ts. Under Jest, a second press on the code step does not
// reach the screen, so these tests press it once, in the last test.
describe('ChangeEmail', () => {
  it('sends codes to the new email, trimmed and lower-cased', async () => {
    await sendCodes();

    expect(requestEmailChange).toHaveBeenCalledWith(NEW);
    expect(screen.getByLabelText(`Code sent to ${CURRENT}`)).toBeTruthy();
  });

  it('refuses the current email', async () => {
    await typeNewEmail(CURRENT);

    expect(await screen.findByText('This is already your email.')).toBeTruthy();
    expect(requestEmailChange).not.toHaveBeenCalled();
  });

  it('says when another account already uses the email', async () => {
    jest
      .mocked(requestEmailChange)
      .mockRejectedValue(new AuthApiError('exists', 422, 'email_exists'));

    await typeNewEmail(NEW);

    expect(
      await screen.findByText('Another FlatMate account already uses this email.'),
    ).toBeTruthy();
  });

  it('asks for both codes before sending either', async () => {
    const user = await sendCodes();

    enterCodes('111111', '');
    await user.press(screen.getByRole('button', { name: 'Confirm new email' }));

    expect(
      await screen.findByText('Enter the 6-digit code sent to your current email.'),
    ).toBeTruthy();
    expect(confirmEmailChangeCode).not.toHaveBeenCalled();
  });
});
