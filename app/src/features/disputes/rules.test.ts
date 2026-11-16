import { formatMinorUnits } from '@/lib/money';

import {
  canRaiseDispute,
  describeDisputeEvent,
  describeProposal,
  disputePermissions,
  disputeStatus,
} from './rules';

const ANAS = 'anas';
const ZUBAIR = 'zubair';
const AJMAL = 'ajmal';
const KAMRAN = 'kamran';

const viewer = (
  userId: string,
  role: 'admin' | 'member' = 'member',
  leftAt: string | null = null,
) => ({
  userId,
  role,
  leftAt,
});

describe('canRaiseDispute', () => {
  const groceries = {
    status: 'provisional' as const,
    createdBy: ZUBAIR,
    splits: [
      { userId: ANAS, amountMinor: 10_000, basisPoints: null },
      { userId: ZUBAIR, amountMinor: 10_000, basisPoints: null },
    ],
  };

  it('lets someone in the split object to an expense they did not add', () => {
    expect(canRaiseDispute(groceries, viewer(ANAS), false)).toBe(true);
    expect(canRaiseDispute({ ...groceries, status: 'final' }, viewer(ANAS), false)).toBe(true);
  });

  it('does not offer it to the creator, outsiders, former members or twice', () => {
    expect(canRaiseDispute(groceries, viewer(ZUBAIR), false)).toBe(false);
    expect(canRaiseDispute(groceries, viewer(AJMAL), false)).toBe(false);
    expect(canRaiseDispute(groceries, viewer(ANAS, 'member', '2026-11-10'), false)).toBe(false);
    expect(canRaiseDispute(groceries, viewer(ANAS), true)).toBe(false);
    expect(canRaiseDispute({ ...groceries, status: 'void' }, viewer(ANAS), false)).toBe(false);
  });
});

describe('disputePermissions', () => {
  const open = { state: 'open' as const, raisedBy: ANAS };

  it('lets the creator answer and the raiser withdraw an open dispute', () => {
    expect(disputePermissions(open, ZUBAIR, viewer(ZUBAIR), true)).toEqual({
      canRespond: true,
      canWithdraw: false,
      canDecide: false,
      canAddEvidence: true,
    });
    expect(disputePermissions(open, ZUBAIR, viewer(ANAS), true)).toMatchObject({
      canRespond: false,
      canWithdraw: true,
    });
  });

  it('leaves an escalated dispute to an admin with no part in it', () => {
    const escalated = { ...open, state: 'escalated' as const };
    expect(disputePermissions(escalated, ZUBAIR, viewer(KAMRAN, 'admin'), true).canDecide).toBe(
      true,
    );
    expect(disputePermissions(escalated, ZUBAIR, viewer(ZUBAIR, 'admin'), true).canDecide).toBe(
      false,
    );
    expect(disputePermissions(escalated, ZUBAIR, viewer(AJMAL), true).canDecide).toBe(false);
    expect(disputePermissions(escalated, ZUBAIR, viewer(ZUBAIR), true).canRespond).toBe(false);
  });

  it('lets an admin decide an open dispute once the creator has left', () => {
    expect(disputePermissions(open, ZUBAIR, viewer(KAMRAN, 'admin'), false).canDecide).toBe(true);
    expect(disputePermissions(open, ZUBAIR, viewer(KAMRAN, 'admin'), true).canDecide).toBe(false);
  });

  it('allows nothing once resolved', () => {
    const resolved = { ...open, state: 'resolved' as const };
    expect(Object.values(disputePermissions(resolved, ZUBAIR, viewer(ANAS), true))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('dispute wording', () => {
  const money = (amount: number) => `${formatMinorUnits(amount)} PKR`;

  it('keeps every state distinct', () => {
    expect(disputeStatus({ state: 'open', resolution: null, isLate: false }).label).toBe(
      'Disputed',
    );
    expect(disputeStatus({ state: 'open', resolution: null, isLate: true }).label).toBe(
      'Adjustment case',
    );
    expect(disputeStatus({ state: 'escalated', resolution: null, isLate: false }).label).toBe(
      'Waiting for an admin',
    );
    expect(disputeStatus({ state: 'resolved', resolution: 'upheld', isLate: false }).label).toBe(
      'Upheld',
    );
  });

  it('describes a proposal against the current share', () => {
    expect(describeProposal({ kind: 'adjustment', proposedShareMinor: 5000 }, 10_000, money)).toBe(
      'Proposes a share of 50.00 PKR instead of 100.00 PKR',
    );
    expect(describeProposal({ kind: 'decline', proposedShareMinor: 0 }, 10_000, money)).toBe(
      'Declines to share this expense',
    );
  });

  it('describes each step of the history', () => {
    expect(describeDisputeEvent({ action: 'rejected' }, 'Zubair')).toBe(
      'Zubair rejected the proposal',
    );
    expect(describeDisputeEvent({ action: 'upheld' }, 'Kamran')).toBe(
      'Kamran decided to keep the expense as it was',
    );
  });
});
