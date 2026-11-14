import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

export type SignUpResult = { needsEmailConfirmation: boolean };

/**
 * Where a confirmation link in an email lands: the app's auth/callback screen,
 * which exchanges the link's code for a session. It works on the phone that
 * signed up, which holds the PKCE verifier for that code. The 6-digit code in
 * the email works anywhere; a project whose email templates show only a link
 * (the free plan's built-in sender) relies on this.
 */
function emailLinkRedirect(): string {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

export async function signUpWithEmail(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      // Read by the database when it creates the profile.
      data: { display_name: input.displayName },
      emailRedirectTo: emailLinkRedirect(),
    },
  });
  if (error) throw error;
  return { needsEmailConfirmation: data.session === null };
}

export async function confirmEmailWithCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) throw error;
}

export async function resendConfirmationCode(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: emailLinkRedirect() },
  });
  if (error) throw error;
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

/** Accepts a password reset code, which signs the user in for the reset. */
export async function verifyPasswordResetCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
  if (error) throw error;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export const AUTH_CALLBACK_PATH = 'auth/callback';

/**
 * Signs in with Google through the system browser. Supabase redirects back to
 * flatmate://auth/callback with a one-time code, which is exchanged for a
 * session here.
 */
export async function signInWithGoogle(): Promise<'signed-in' | 'cancelled'> {
  const redirectTo = Linking.createURL(AUTH_CALLBACK_PATH);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    return 'cancelled';
  }
  await exchangeAuthCallbackUrl(result.url);
  return 'signed-in';
}

export async function exchangeAuthCallbackUrl(url: string): Promise<void> {
  const { queryParams } = Linking.parse(url);
  if (typeof queryParams?.error_description === 'string') {
    throw new Error(queryParams.error_description);
  }
  const code = queryParams?.code;
  if (typeof code !== 'string') {
    throw new Error('The sign-in did not return a code.');
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}
