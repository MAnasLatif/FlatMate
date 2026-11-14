import { screen, userEvent } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';

import { renderWithProviders } from '@/test/render';

import { PasswordField } from './password-field';
import { TextInputField } from './text-input-field';

type Values = { password: string; email: string; note: string };

function Form({ purpose }: { purpose: 'new' | 'current' }) {
  const form = useForm<Values>({ defaultValues: { password: '', email: '', note: '' } });
  return (
    <>
      <TextInputField control={form.control} name="email" label="Email" autoComplete="email" />
      <TextInputField control={form.control} name="note" label="Note" />
      <PasswordField control={form.control} name="password" label="Password" purpose={purpose} />
    </>
  );
}

describe('PasswordField', () => {
  it('hides the password until asked, then shows it, and hides it again', async () => {
    await renderWithProviders(<Form purpose="current" />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('Password');
    expect(input).toHaveProp('secureTextEntry', true);

    await user.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);

    await user.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
  });

  it('asks the password manager for a new password when choosing one', async () => {
    await renderWithProviders(<Form purpose="new" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveProp('autoComplete', 'new-password');
    expect(input).toHaveProp('textContentType', 'newPassword');
    expect(input).toHaveProp('importantForAutofill', 'yes');
  });

  it('asks for the saved password when signing in', async () => {
    await renderWithProviders(<Form purpose="current" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveProp('autoComplete', 'current-password');
    expect(input).toHaveProp('textContentType', 'password');
  });
});

describe('TextInputField autofill', () => {
  it('asks for autofill only on fields that say what they hold', async () => {
    await renderWithProviders(<Form purpose="current" />);
    expect(screen.getByLabelText('Email')).toHaveProp('importantForAutofill', 'yes');
    expect(screen.getByLabelText('Note')).not.toHaveProp('importantForAutofill', 'yes');
  });
});
