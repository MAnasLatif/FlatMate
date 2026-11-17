import { paymentPermissions, paymentStatus, planPayment } from './rules';

describe('planPayment', () => {
  it('pays everything owed by default, or part of it (FR-07.3)', () => {
    expect(planPayment(15_000, 0, 'gross', '')).toEqual({
      plan: { offsetMinor: 0, payMinor: 15_000 },
    });
    expect(planPayment(15_000, 0, 'gross', '120')).toEqual({
      plan: { offsetMinor: 0, payMinor: 12_000 },
    });
  });

  it('nets off first in net mode and pays the rest (FR-07.1, AC-09)', () => {
    expect(planPayment(15_000, 12_000, 'net', '')).toEqual({
      plan: { offsetMinor: 12_000, payMinor: 3000 },
    });
  });

  it('only nets off when the other person owes as much or more', () => {
    expect(planPayment(5000, 8000, 'net', '')).toEqual({
      plan: { offsetMinor: 5000, payMinor: 0 },
    });
  });

  it('refuses more than is owed, and nothing to pay', () => {
    expect(planPayment(15_000, 12_000, 'net', '31').error).toBe(
      'That is more than you owe after netting off.',
    );
    expect(planPayment(15_000, 0, 'gross', '150.01').error).toBe('That is more than you owe.');
    expect(planPayment(15_000, 0, 'gross', 'abc').error).toMatch(/Enter the amount/);
    expect(planPayment(0, 5000, 'gross', '').error).toBe(
      'You do not owe this person anything right now.',
    );
  });
});

describe('paymentPermissions', () => {
  const payment = { payerId: 'zubair', recipientId: 'anas', status: 'provisional' as const };

  it('lets the recipient decline and the payer void or add proof', () => {
    expect(paymentPermissions(payment, 'anas', undefined)).toEqual({
      canDecline: true,
      canWithdrawDecline: false,
      canVoid: false,
      canAddProof: false,
      canAdjust: false,
    });
    expect(paymentPermissions(payment, 'zubair', undefined)).toEqual({
      canDecline: false,
      canWithdrawDecline: false,
      canVoid: true,
      canAddProof: true,
      canAdjust: false,
    });
  });

  it('lets the recipient withdraw an open objection, and keeps a final payment', () => {
    expect(
      paymentPermissions({ ...payment, status: 'disputed' }, 'anas', {
        raisedBy: 'anas',
        isLate: false,
      }),
    ).toMatchObject({ canDecline: false, canWithdrawDecline: true });
    expect(paymentPermissions({ ...payment, status: 'final' }, 'zubair', undefined).canVoid).toBe(
      false,
    );
  });

  it('allows nothing to someone else', () => {
    expect(Object.values(paymentPermissions(payment, 'ajmal', undefined))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  describe('a late objection to a final payment', () => {
    const final = { ...payment, status: 'final' as const };
    const late = { raisedBy: 'anas', isLate: true };

    it('lets the payer or a neutral admin settle it with an adjustment', () => {
      expect(paymentPermissions(final, 'zubair', late).canAdjust).toBe(true);
      expect(paymentPermissions(final, 'ajmal', late, true).canAdjust).toBe(true);
    });

    it('never lets the recipient decide it, even as an admin', () => {
      expect(paymentPermissions(final, 'anas', late, true).canAdjust).toBe(false);
      expect(paymentPermissions(final, 'anas', late, true).canWithdrawDecline).toBe(true);
    });

    it('offers no adjustment to other members, or for an objection inside the window', () => {
      expect(paymentPermissions(final, 'ajmal', late).canAdjust).toBe(false);
      expect(
        paymentPermissions({ ...payment, status: 'disputed' }, 'zubair', {
          raisedBy: 'anas',
          isLate: false,
        }).canAdjust,
      ).toBe(false);
    });
  });
});

describe('paymentStatus', () => {
  it('never claims bank verification (FR-07.8)', () => {
    expect(paymentStatus('final').label).toBe('Confirmed by app policy');
    expect(paymentStatus('final').explanation).toMatch(/No bank has verified it/);
    expect(
      new Set(
        ['provisional', 'disputed', 'final', 'void'].map((s) => paymentStatus(s as never).label),
      ).size,
    ).toBe(4);
  });
});
