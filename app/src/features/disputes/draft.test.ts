import { validateDisputeDraft } from './draft';

describe('validateDisputeDraft', () => {
  it('accepts a decline with a reason as a zero share', () => {
    expect(
      validateDisputeDraft({ kind: 'decline', share: '', reason: ' Away ' }, 10_000, 30_000),
    ).toEqual({
      errors: {},
      value: { kind: 'decline', proposedShareMinor: 0, reason: 'Away' },
    });
  });

  it('accepts a different share up to the total', () => {
    expect(
      validateDisputeDraft({ kind: 'adjustment', share: '50', reason: 'Half' }, 10_000, 30_000)
        .value,
    ).toEqual({ kind: 'adjustment', proposedShareMinor: 5000, reason: 'Half' });
  });

  it('asks for a reason', () => {
    expect(
      validateDisputeDraft({ kind: 'decline', share: '', reason: '  ' }, 10_000, 30_000).errors
        .reason,
    ).toBe('Say why you object.');
  });

  it.each([
    ['abc', 'Enter the share you think is fair, such as 50 or 50.25.'],
    ['300.01', 'Your share cannot be more than 300.00.'],
    ['100', 'That is already your share. Enter a different amount.'],
  ])('refuses a share of %p', (share, message) => {
    expect(
      validateDisputeDraft({ kind: 'adjustment', share, reason: 'Why' }, 10_000, 30_000).errors
        .share,
    ).toBe(message);
  });

  it('does not let someone with no share decline', () => {
    expect(
      validateDisputeDraft({ kind: 'decline', share: '', reason: 'Why' }, 0, 30_000).value,
    ).toBeUndefined();
  });
});
