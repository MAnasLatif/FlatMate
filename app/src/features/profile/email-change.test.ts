import { confirmBothCodes, EmailChangeCodeError } from './email-change';

const emails = { new: 'new@example.com', current: 'old@example.com' };
const codes = { new: '111111', current: '222222' };

describe('confirmBothCodes', () => {
  it('confirms each code with the address it was sent to', async () => {
    const confirm = jest.fn().mockResolvedValue(undefined);
    const onConfirmed = jest.fn();

    await confirmBothCodes({
      emails,
      codes,
      confirmed: { new: false, current: false },
      confirm,
      onConfirmed,
    });

    expect(confirm.mock.calls).toEqual([
      ['new@example.com', '111111'],
      ['old@example.com', '222222'],
    ]);
    expect(onConfirmed.mock.calls).toEqual([['new'], ['current']]);
  });

  it('says which code was rejected and stops there', async () => {
    const rejected = new Error('expired');
    const confirm = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(rejected);
    const onConfirmed = jest.fn();

    const result = confirmBothCodes({
      emails,
      codes,
      confirmed: { new: false, current: false },
      confirm,
      onConfirmed,
    });

    await expect(result).rejects.toEqual(new EmailChangeCodeError('current', rejected));
    await result.catch((error: EmailChangeCodeError) => {
      expect(error.side).toBe('current');
      expect(error.cause).toBe(rejected);
    });
    expect(onConfirmed.mock.calls).toEqual([['new']]);
  });

  it('does not send an accepted code again when retrying', async () => {
    const confirm = jest.fn().mockResolvedValue(undefined);

    await confirmBothCodes({
      emails,
      codes,
      confirmed: { new: true, current: false },
      confirm,
      onConfirmed: jest.fn(),
    });

    expect(confirm.mock.calls).toEqual([['old@example.com', '222222']]);
  });

  it('stops at the new address when its code is rejected', async () => {
    const confirm = jest.fn().mockRejectedValue(new Error('wrong'));

    await expect(
      confirmBothCodes({
        emails,
        codes,
        confirmed: { new: false, current: false },
        confirm,
        onConfirmed: jest.fn(),
      }),
    ).rejects.toMatchObject({ side: 'new' });
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
