import { router } from 'expo-router';
import { Button, Card, PressableFeedback, Separator, Typography } from 'heroui-native';
import { View } from 'react-native';

import { LoadError } from '@/components/query-states';
import { StatusChip } from '@/components/status-chip';
import { useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { useExpenseDetail } from '@/features/expenses/hooks';
import { memberLabel } from '@/features/expenses/member-label';
import { UnreadDot, withUnread } from '@/features/notifications/components/unread-dot';
import { useIsUnread } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

import type { Dispute } from '../api';
import { useExpenseDisputes } from '../hooks';
import { canRaiseDispute, disputeStatus } from '../rules';

/** An expense's disputes, and the way to raise one, for the expense screen (SRS FR-03.6). */
export function ExpenseDisputes({
  apartmentId,
  expenseId,
}: {
  apartmentId: string;
  expenseId: string;
}) {
  const userId = useCurrentUserId();
  const disputes = useExpenseDisputes(apartmentId, expenseId);
  const expense = useExpenseDetail(apartmentId, expenseId);
  const members = useMembers(apartmentId);
  const isUnread = useIsUnread();

  // The expense screen shows its own loading and error states for the expense and members.
  if (disputes.isPending || !expense.data || !members.data) return null;

  const viewer = members.data.find((member) => member.userId === userId);
  const list = disputes.data ?? [];
  const canRaise =
    disputes.isSuccess &&
    canRaiseDispute(
      expense.data,
      viewer,
      list.some((dispute) => dispute.state !== 'resolved'),
    );
  if (!disputes.isLoadingError && list.length === 0 && !canRaise) return null;

  const nameOf = (id: string) => {
    const member = members.data.find((item) => item.userId === id);
    return member ? memberLabel(member, userId) : 'A former member';
  };
  const open = (disputeId: string) =>
    router.push({
      pathname: '/apartments/[apartmentId]/disputes/[disputeId]',
      params: { apartmentId, disputeId },
    });

  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>Disputes</Card.Title>
        <Separator />
        {disputes.isLoadingError ? (
          <LoadError
            message={userErrorMessage(disputes.error, 'Could not load the disputes.')}
            onRetry={() => void disputes.refetch()}
          />
        ) : null}
        {list.map((dispute) => (
          <DisputeRow
            key={dispute.id}
            dispute={dispute}
            raiserName={nameOf(dispute.raisedBy)}
            unread={isUnread(unreadMatches.dispute(apartmentId, dispute.id))}
            onPress={() => open(dispute.id)}
          />
        ))}
        {canRaise ? (
          <Button
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/apartments/[apartmentId]/expenses/[expenseId]/dispute',
                params: { apartmentId, expenseId },
              })
            }
          >
            Dispute this expense
          </Button>
        ) : null}
      </Card.Body>
    </Card>
  );
}

function DisputeRow({
  dispute,
  raiserName,
  unread,
  onPress,
}: {
  dispute: Dispute;
  raiserName: string;
  unread: boolean;
  onPress: () => void;
}) {
  const status = disputeStatus(dispute);
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={withUnread(`Dispute by ${raiserName}, ${status.label}`, unread)}
      className="flex-row items-center gap-3"
    >
      {unread ? <UnreadDot /> : null}
      <View className="flex-1 gap-0.5">
        <Typography.Paragraph type="body-sm">
          {raiserName} {dispute.kind === 'decline' ? 'declined it' : 'proposed another share'}
        </Typography.Paragraph>
        <Typography.Paragraph type="body-xs" color="muted">
          {formatDate(dispute.createdAt)}
        </Typography.Paragraph>
      </View>
      <StatusChip size="sm" variant="soft" color={status.color}>
        {status.label}
      </StatusChip>
    </PressableFeedback>
  );
}
