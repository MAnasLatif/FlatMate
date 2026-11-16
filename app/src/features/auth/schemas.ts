import { z } from 'zod';

// Supabase Auth rejects passwords shorter than this (supabase/config.toml).
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt, which stores the password, ignores everything after 72 bytes.
export const PASSWORD_MAX_LENGTH = 72;
export const DISPLAY_NAME_MAX_LENGTH = 80;
export const EMAIL_CODE_LENGTH = 6;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.'));

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your name.')
  .max(DISPLAY_NAME_MAX_LENGTH, `Use at most ${DISPLAY_NAME_MAX_LENGTH} characters.`);

export const emailCodeSchema = z
  .string()
  .regex(
    new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`),
    `Enter the ${EMAIL_CODE_LENGTH}-digit code from the email.`,
  );

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const signUpSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: newPasswordSchema,
});

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  code: emailCodeSchema,
  password: newPasswordSchema,
});

export const changePasswordSchema = z.object({
  password: newPasswordSchema,
});
