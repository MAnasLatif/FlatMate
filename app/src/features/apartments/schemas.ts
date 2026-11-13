import { z } from 'zod';

export const APARTMENT_NAME_MAX_LENGTH = 80;
export const LOCATION_MAX_LENGTH = 120;
export const CATEGORY_NAME_MAX_LENGTH = 40;
export const DEFAULT_APPROVAL_DAYS = 7;

/** Whole numbers typed into a text field, checked against a range. */
function wholeNumberBetween(min: number, max: number, message: string) {
  return z
    .string()
    .trim()
    .regex(/^\d+$/, message)
    .transform(Number)
    .pipe(z.number().int().min(min, message).max(max, message));
}

const apartmentDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name for the apartment.')
    .max(APARTMENT_NAME_MAX_LENGTH, `Use at most ${APARTMENT_NAME_MAX_LENGTH} characters.`),
  location: z
    .string()
    .trim()
    .max(LOCATION_MAX_LENGTH, `Use at most ${LOCATION_MAX_LENGTH} characters.`)
    .transform((value) => (value === '' ? null : value)),
  showLocation: z.boolean(),
  timezone: z.string().trim().min(1, 'Enter a time zone, such as Asia/Karachi.'),
  settlementDay: wholeNumberBetween(1, 31, 'Enter a day of the month from 1 to 31.'),
  approvalDays: wholeNumberBetween(1, 30, 'Enter a number of days from 1 to 30.'),
});

/**
 * The apartment form, used to create an apartment and to edit its settings.
 * The currency can only be chosen at creation; the settings screen shows it
 * locked.
 */
export const apartmentFormSchema = apartmentDetailsSchema.extend({
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'Enter a 3-letter currency code, such as PKR.')
    .transform((value) => value.toUpperCase()),
});

/**
 * A join code as typed: separators and spaces are ignored, letters may be
 * lower case. The database does the same and checks the code itself.
 */
export const joinCodeSchema = z.object({
  code: z
    .string()
    .transform((value) => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
    .pipe(z.string().length(8, 'A join code has 8 letters and digits, such as 7KQ2-M9XD.')),
});

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name for the category.')
  .max(CATEGORY_NAME_MAX_LENGTH, `Use at most ${CATEGORY_NAME_MAX_LENGTH} characters.`);
