import { router } from 'expo-router';
import {
  Button,
  Card,
  FieldError,
  Input,
  Label,
  TextArea,
  TextField,
  Typography,
} from 'heroui-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { FormAlert } from '@/components/form/form-alert';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { Member } from '@/features/apartments/api';
import { useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import type { ExpenseDetail } from '@/features/expenses/api';
import { useExpenseDetail } from '@/features/expenses/hooks';
import { memberLabel } from '@/features/expenses/member-label';
import { adjustedSplit } from '@/features/expenses/split';
import { userErrorMessage } from '@/lib/errors';
import { formatMinorUnits } from '@/lib/money';
import { randomUuid } from '@/lib/uuid';

import type { DisputeKind } from '../api';
import { type DisputeDraft, validateDisputeDraft } from '../draft';
import { DISPUTE_ERROR_MESSAGES } from '../errors';
import { useExpenseDisputes, useRaiseDispute } from '../hooks';
import { canRaiseDispute } from '../rules';

/** Declining an expense or proposing a different share of it (SRS FR-05.2). */
export function RaiseDispute({
  apartmentId,
  expenseId,
}: {
  apartmentId: string;
  expenseId: string;
}) {
  const userId = useCurrentUserId();
  const expense = useExpenseDetail(apartmentId, expenseId);
  const members = useMembers(apartmentId);
  const disputes = useExpenseDisputes(apartmentId, expenseId);

  if (expense.isPending || members.isPending || disputes.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  const loadError = expense.error ?? members.error ?? disputes.error;
  if (loadError || !members.data || !disputes.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load this expense.')}
          onRetry={() => {
            void expense.refetch();
            void members.refetch();
            void disputes.refetch();
          }}
        />
      </Screen>
    );
  }

  const viewer = members.data.find((member) => member.userId === userId);
  const hasOpenDispute = disputes.data.some((dispute) => dispute.state !== 'resolved');
  if (!expense.data || !canRaiseDispute(expense.data, viewer, hasOpenDispute)) {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message={
            hasOpenDispute
              ? DISPUTE_ERROR_MESSAGES.dispute_already_open
              : 'You cannot dispute this expense.'
          }
        />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  return (
    <RaiseDisputeForm apartmentId={apartmentId} expense={expense.data} members={members.data} />
  );
}

const KIND_CHOICES: { value: DisputeKind; label: string }[] = [
  { value: 'decline', label: 'I should not share it' },
  { value: 'adjustment', label: 'My share should be different' },
];

function RaiseDisputeForm({
  apartmentId,
  expense,
  members,
}: {
  apartmentId: string;
  expense: ExpenseDetail;
  members: Member[];
}) {
  const userId = useCurrentUserId();
  const [draft, setDraft] = useState<DisputeDraft>({ kind: 'decline', share: '', reason: '' });
  const [showErrors, setShowErrors] = useState(false);
  // One id per dispute being raised, so a retried save cannot raise two.
  const [requestId] = useState(randomUuid);
  const raise = useRaiseDispute(apartmentId);

  const money = (amountMinor: number) => `${formatMinorUnits(amountMinor)} ${expense.currency}`;
  const currentShare = expense.splits.find((split) => split.userId === userId)?.amountMinor ?? 0;
  const result = useMemo(
    () => validateDisputeDraft(draft, currentShare, expense.amountMinor),
    [draft, currentShare, expense.amountMinor],
  );
  const preview = result.value
    ? adjustedSplit(expense.splits, userId, result.value.proposedShareMinor)
    : null;
  // The server decides; a final expense is past its window. In the few minutes between a
  // deadline and the job that finalizes it, this text may still describe a hold.
  const isLate = expense.status === 'final';
  const nameOf = (id: string) => {
    const member = members.find((item) => item.userId === id);
    return member ? memberLabel(member, userId) : 'A former member';
  };

  const save = () => {
    setShowErrors(true);
    if (!result.value || !preview) return;
    raise.mutate(
      { expenseId: expense.id, ...result.value, requestId },
      {
        onSuccess: (disputeId) =>
          router.replace({
            pathname: '/apartments/[apartmentId]/disputes/[disputeId]',
            params: { apartmentId, disputeId },
          }),
      },
    );
  };

  return (
    <Screen padTop={false}>
      <Typography.Paragraph type="body-sm" color="muted">
        {expense.title}, {money(expense.amountMinor)}. Your share is {money(currentShare)}.{' '}
        {isLate
          ? 'Its objection window has closed, so this opens an adjustment case. The expense stays final until the case is resolved.'
          : 'While your dispute is open, the whole expense is held: nobody pays any of it until it is resolved.'}
      </Typography.Paragraph>

      <View className="gap-2">
        <Label>What is wrong?</Label>
        <ChoiceChips
          accessibilityLabel="What is wrong"
          choices={KIND_CHOICES}
          selected={draft.kind}
          onSelect={(kind) => setDraft((current) => ({ ...current, kind }))}
        />
      </View>

      {draft.kind === 'adjustment' ? (
        <TextField isRequired isInvalid={showErrors && result.errors.share !== undefined}>
          <Label>Your fair share ({expense.currency})</Label>
          <Input
            value={draft.share}
            onChangeText={(share) => setDraft((current) => ({ ...current, share }))}
            keyboardType="decimal-pad"
            placeholder="0.00"
            accessibilityLabel={`Your fair share, in ${expense.currency}`}
          />
          <FieldError>{showErrors ? result.errors.share : undefined}</FieldError>
        </TextField>
      ) : showErrors && result.errors.share ? (
        <FieldError isInvalid>{result.errors.share}</FieldError>
      ) : null}

      <TextField isRequired isInvalid={showErrors && result.errors.reason !== undefined}>
        <Label>Why?</Label>
        <TextArea
          value={draft.reason}
          onChangeText={(reason) => setDraft((current) => ({ ...current, reason }))}
          placeholder="I was away that week, I did not use it…"
          accessibilityLabel="Why you object"
        />
        <FieldError>{showErrors ? result.errors.reason : undefined}</FieldError>
      </TextField>

      {result.value ? (
        <Card>
          <Card.Body className="gap-2">
            <Card.Title>If {nameOf(expense.createdBy)} accepts</Card.Title>
            {preview ? (
              preview.map((share) => (
                <View key={share.userId} className="flex-row justify-between gap-3">
                  <Typography.Paragraph type="body-sm">{nameOf(share.userId)}</Typography.Paragraph>
                  <Typography.Paragraph type="body-sm" weight="semibold">
                    {money(share.amountMinor)}
                  </Typography.Paragraph>
                </View>
              ))
            ) : (
              <Typography.Paragraph type="body-sm">
                {DISPUTE_ERROR_MESSAGES.adjustment_not_possible}
              </Typography.Paragraph>
            )}
            <Typography.Paragraph type="body-xs" color="muted">
              The difference is shared by the others in proportion to their shares. They can then
              object to their new shares.
            </Typography.Paragraph>
          </Card.Body>
        </Card>
      ) : null}

      <FormAlert
        message={
          raise.error
            ? userErrorMessage(
                raise.error,
                'Could not raise the dispute. Please try again.',
                DISPUTE_ERROR_MESSAGES,
              )
            : showErrors && !result.value
              ? 'Check the highlighted fields.'
              : null
        }
      />
      <Button onPress={save} isDisabled={raise.isPending}>
        {raise.isPending ? 'Sending…' : 'Raise dispute'}
      </Button>
    </Screen>
  );
}
