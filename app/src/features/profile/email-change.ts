/** The two addresses that each get a code when the email changes. */
export type EmailChangeSide = 'new' | 'current';

/** One of the two codes was rejected; `side` says which. */
export class EmailChangeCodeError extends Error {
  constructor(
    readonly side: EmailChangeSide,
    readonly cause: unknown,
  ) {
    super(`The code sent to the ${side} email was rejected.`);
    this.name = 'EmailChangeCodeError';
  }
}

type ConfirmBothCodesInput = {
  emails: Record<EmailChangeSide, string>;
  codes: Record<EmailChangeSide, string>;
  /** Codes already accepted. A code cannot be used twice, so these are skipped. */
  confirmed: Record<EmailChangeSide, boolean>;
  confirm: (email: string, code: string) => Promise<void>;
  onConfirmed: (side: EmailChangeSide) => void;
};

/**
 * Confirms the email-change codes that are not confirmed yet, the new
 * address's first. The change happens once both are accepted, in any order.
 */
export async function confirmBothCodes({
  emails,
  codes,
  confirmed,
  confirm,
  onConfirmed,
}: ConfirmBothCodesInput): Promise<void> {
  for (const side of ['new', 'current'] as const) {
    if (confirmed[side]) continue;
    try {
      await confirm(emails[side], codes[side]);
    } catch (error) {
      throw new EmailChangeCodeError(side, error);
    }
    onConfirmed(side);
  }
}
