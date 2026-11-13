import { router } from 'expo-router';
import { Button, Card, Chip, PressableFeedback, Separator, Typography } from 'heroui-native';
import { View } from 'react-native';

import { LoadError } from '@/components/query-states';
import { useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { useExpenseDetail } from '@/features/expenses/hooks';
import { memberLabel } from '@/features/expenses/member-label';
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
  if (!disputes.isError && list.length === 0 && !canRaise) return null;

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
        {disputes.isError ? (
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
  onPress,
}: {
  dispute: Dispute;
  raiserName: string;
  onPress: () => void;
}) {
  const status = disputeStatus(dispute);
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Dispute by ${raiserName}, ${status.label}`}
      className="flex-row items-center gap-3"
    >
      <View className="flex-1 gap-0.5">
        <Typography.Paragraph type="body-sm">
          {raiserName} {dispute.kind === 'decline' ? 'declined it' : 'proposed another share'}
        </Typography.Paragraph>
        <Typography.Paragraph type="body-xs" color="muted">
          {formatDate(dispute.createdAt)}
        </Typography.Paragraph>
      </View>
      <Chip size="sm" variant="soft" color={status.color}>
        {status.label}
      </Chip>
    </PressableFeedback>
  );
}
