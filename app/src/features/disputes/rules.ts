import type { ComponentProps } from 'react';

import type { Chip } from 'heroui-native';

import type { Member } from '@/features/apartments/api';
import type { ExpenseDetail } from '@/features/expenses/api';

import type { Dispute, DisputeEvent } from './api';

type Viewer = Pick<Member, 'userId' | 'role' | 'leftAt'> | undefined;

function isActive(viewer: Viewer): viewer is NonNullable<Viewer> {
  return viewer !== undefined && viewer.leftAt === null;
}

/**
 * Whether the viewer can object to the expense now: a current member in its
 * split who did not add it, while it is not void and not already disputed.
 * Mirrors raise_dispute, which has the final say (decision record 0004).
 */
export function canRaiseDispute(
  expense: Pick<ExpenseDetail, 'status' | 'createdBy' | 'splits'>,
  viewer: Viewer,
  hasOpenDispute: boolean,
): boolean {
  if (!isActive(viewer) || hasOpenDispute) return false;
  if (expense.status === 'void' || expense.status === 'disputed') return false;
  if (viewer.userId === expense.createdBy) return false;
  return expense.splits.some((split) => split.userId === viewer.userId);
}

export type DisputePermissions = {
  /** The expense's creator accepts or rejects an open dispute. */
  canRespond: boolean;
  /** The raiser takes back an unresolved dispute. */
  canWithdraw: boolean;
  /** An admin with no part in it decides an escalated dispute, or one the creator can no longer answer. */
  canDecide: boolean;
  /** The two people in it and admins add photos while it is unresolved. */
  canAddEvidence: boolean;
};

/** What the viewer can do with a dispute. The database enforces the same rules. */
export function disputePermissions(
  dispute: Pick<Dispute, 'state' | 'raisedBy'>,
  expenseCreatorId: string,
  viewer: Viewer,
  creatorIsActive: boolean,
): DisputePermissions {
  if (!isActive(viewer) || dispute.state === 'resolved') {
    return { canRespond: false, canWithdraw: false, canDecide: false, canAddEvidence: false };
  }
  const isParty = viewer.userId === dispute.raisedBy || viewer.userId === expenseCreatorId;
  const isAdmin = viewer.role === 'admin';
  return {
    canRespond: viewer.userId === expenseCreatorId && dispute.state === 'open',
    canWithdraw: viewer.userId === dispute.raisedBy,
    canDecide:
      isAdmin &&
      !isParty &&
      (dispute.state === 'escalated' || (dispute.state === 'open' && !creatorIsActive)),
    canAddEvidence: isParty || isAdmin,
  };
}

type ChipColor = NonNullable<ComponentProps<typeof Chip>['color']>;

/** A short status for a dispute, kept distinct for each state and outcome. */
export function disputeStatus(dispute: Pick<Dispute, 'state' | 'resolution' | 'isLate'>): {
  label: string;
  color: ChipColor;
} {
  if (dispute.state === 'open') {
    return dispute.isLate
      ? { label: 'Adjustment case', color: 'warning' }
      : { label: 'Disputed', color: 'danger' };
  }
  if (dispute.state === 'escalated') return { label: 'Waiting for an admin', color: 'warning' };
  if (dispute.resolution === 'adjusted') return { label: 'Adjusted', color: 'success' };
  if (dispute.resolution === 'upheld') return { label: 'Upheld', color: 'default' };
  return { label: 'Withdrawn', color: 'default' };
}

/** What the raiser asks for, such as "Proposes a share of 50.00 PKR instead of 100.00 PKR". */
export function describeProposal(
  dispute: Pick<Dispute, 'kind' | 'proposedShareMinor'>,
  currentShareMinor: number | undefined,
  money: (amountMinor: number) => string,
): string {
  if (dispute.kind === 'decline') return 'Declines to share this expense';
  const instead = currentShareMinor === undefined ? '' : ` instead of ${money(currentShareMinor)}`;
  return `Proposes a share of ${money(dispute.proposedShareMinor)}${instead}`;
}

/** One line of a dispute's history, such as "Zubair rejected the proposal". */
export function describeDisputeEvent(event: Pick<DisputeEvent, 'action'>, actorName: string) {
  switch (event.action) {
    case 'raised':
      return `${actorName} raised this dispute`;
    case 'accepted':
      return `${actorName} accepted the proposal`;
    case 'rejected':
      return `${actorName} rejected the proposal`;
    case 'withdrawn':
      return `${actorName} withdrew the dispute`;
    case 'upheld':
      return `${actorName} decided to keep the expense as it was`;
    case 'adjusted':
      return `${actorName} decided to adjust the split as proposed`;
  }
}
