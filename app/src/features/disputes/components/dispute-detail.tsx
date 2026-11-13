import { router } from 'expo-router';
import {
  Button,
  Card,
  Chip,
  Label,
  PressableFeedback,
  Separator,
  TextArea,
  TextField,
  Typography,
} from 'heroui-native';
import { type ReactNode, useState } from 'react';
import { Alert, View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { PhotoPicker } from '@/components/photo-picker';
import { PrivateImageThumbnail } from '@/components/private-image';
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
import type { PickedImage } from '@/lib/private-images';
import { formatDate } from '@/lib/time';

import type { DisputeDetail } from '../api';
import { DISPUTE_ERROR_MESSAGES, evidenceUploadErrorMessage } from '../errors';
import { useDisputeActions, useDisputeDetail } from '../hooks';
import {
  describeDisputeEvent,
  describeProposal,
  type DisputePermissions,
  disputePermissions,
  disputeStatus,
} from '../rules';

const MESSAGE_MAX_LENGTH = 1000;

/** A dispute with its proposal, history, evidence and the actions the viewer may take (SRS FR-05.3, FR-05.7). */
export function DisputeDetailView({
  apartmentId,
  disputeId,
}: {
  apartmentId: string;
  disputeId: string;
}) {
  const detail = useDisputeDetail(apartmentId, disputeId);
  const expenseId = detail.data?.dispute.expenseId;
  const expense = useExpenseDetail(apartmentId, expenseId ?? '', expenseId !== undefined);
  const members = useMembers(apartmentId);

  if (detail.isPending || members.isPending || (detail.data && expense.isPending)) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  const loadError = detail.error ?? members.error ?? (detail.data ? expense.error : null);
  if (loadError || !members.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load this dispute.')}
          onRetry={() => {
            void detail.refetch();
            void expense.refetch();
            void members.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!detail.data || !expense.data) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message={DISPUTE_ERROR_MESSAGES.dispute_not_found} />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  return (
    <DisputeContent
      apartmentId={apartmentId}
      detail={detail.data}
      expense={expense.data}
      members={members.data}
      refreshing={detail.isRefetching}
      onRefresh={() => {
        void detail.refetch();
        void expense.refetch();
      }}
    />
  );
}

function DisputeContent({
  apartmentId,
  detail,
  expense,
  members,
  refreshing,
  onRefresh,
}: {
  apartmentId: string;
  detail: DisputeDetail;
  expense: ExpenseDetail;
  members: Member[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const userId = useCurrentUserId();
  const { dispute, events, evidence } = detail;
  const money = (amountMinor: number) => `${formatMinorUnits(amountMinor)} ${expense.currency}`;
  const nameOf = (id: string | null) => {
    const member = members.find((item) => item.userId === id);
    return member ? memberLabel(member, userId) : 'A former member';
  };
  const viewer = members.find((member) => member.userId === userId);
  const creatorIsActive = members.some(
    (member) => member.userId === expense.createdBy && member.leftAt === null,
  );
  const permissions = disputePermissions(dispute, expense.createdBy, viewer, creatorIsActive);
  const status = disputeStatus(dispute);
  // The split the proposal would produce, while the expense is still at the revision objected to.
  const preview =
    dispute.state !== 'resolved' && expense.revision === dispute.expenseRevision
      ? adjustedSplit(expense.splits, dispute.raisedBy, dispute.proposedShareMinor)
      : null;
  const raiserShare = expense.splits.find((split) => split.userId === dispute.raisedBy);

  return (
    <Screen padTop={false} refreshing={refreshing} onRefresh={onRefresh}>
      <Card>
        <Card.Body className="gap-2">
          <View className="flex-row">
            <Chip size="sm" variant="soft" color={status.color}>
              {status.label}
            </Chip>
          </View>
          <PressableFeedback
            onPress={() =>
              router.push({
                pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
                params: { apartmentId, expenseId: expense.id },
              })
            }
            accessibilityRole="link"
            accessibilityHint="Opens the expense"
          >
            <Typography.Heading type="h5">
              {expense.title}, {money(expense.amountMinor)}
            </Typography.Heading>
          </PressableFeedback>
          <Typography.Paragraph type="body-sm">
            {nameOf(dispute.raisedBy)}:{' '}
            {describeProposal(
              dispute,
              dispute.state === 'resolved' ? undefined : raiserShare?.amountMinor,
              money,
            )}
            .
          </Typography.Paragraph>
          <Typography.Paragraph type="body-sm" color="muted">
            “{dispute.reason}”
          </Typography.Paragraph>
          {dispute.state !== 'resolved' ? (
            <Typography.Paragraph type="body-xs" color="muted">
              {dispute.isLate
                ? 'Raised after the objection window closed, so nothing is held: the expense stays final until this is resolved.'
                : 'The whole expense is held while this is open: nobody pays any of it until it is resolved.'}
            </Typography.Paragraph>
          ) : null}
        </Card.Body>
      </Card>

      {preview ? (
        <Section title="If the proposal is applied">
          {preview.map((share) => (
            <View key={share.userId} className="flex-row justify-between gap-3">
              <Typography.Paragraph type="body-sm">{nameOf(share.userId)}</Typography.Paragraph>
              <Typography.Paragraph type="body-sm" weight="semibold">
                {money(share.amountMinor)}
              </Typography.Paragraph>
            </View>
          ))}
        </Section>
      ) : null}

      <DisputeActions
        apartmentId={apartmentId}
        disputeId={dispute.id}
        permissions={permissions}
        creatorName={nameOf(expense.createdBy)}
      />

      <Section title="Photos">
        {evidence.length === 0 ? (
          <Typography.Paragraph type="body-sm" color="muted">
            No photos yet.
          </Typography.Paragraph>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {evidence.map((item, index) => (
              <PrivateImageThumbnail
                key={item.id}
                bucket="dispute-evidence"
                path={item.storagePath}
                label={`Open photo ${index + 1}, added by ${nameOf(item.uploadedBy)}`}
                onPress={() =>
                  router.push({
                    pathname: '/apartments/[apartmentId]/photo',
                    params: { apartmentId, bucket: 'dispute-evidence', path: item.storagePath },
                  })
                }
              />
            ))}
          </View>
        )}
        {permissions.canAddEvidence ? (
          <AddEvidence apartmentId={apartmentId} disputeId={dispute.id} />
        ) : null}
      </Section>

      <Section title="History">
        {events.map((event) => (
          <View key={event.id} className="gap-0.5">
            <Typography.Paragraph type="body-sm">
              {describeDisputeEvent(event, nameOf(event.actorId))}
            </Typography.Paragraph>
            {event.message && event.action !== 'raised' ? (
              <Typography.Paragraph type="body-xs" color="muted">
                “{event.message}”
              </Typography.Paragraph>
            ) : null}
            <Typography.Paragraph type="body-xs" color="muted">
              {formatDate(event.createdAt)}
            </Typography.Paragraph>
          </View>
        ))}
      </Section>
    </Screen>
  );
}

/** Answering, deciding and withdrawing, as the viewer's role allows. */
function DisputeActions({
  apartmentId,
  disputeId,
  permissions,
  creatorName,
}: {
  apartmentId: string;
  disputeId: string;
  permissions: DisputePermissions;
  creatorName: string;
}) {
  const actions = useDisputeActions(apartmentId, disputeId);
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState<string | null>(null);
  const isBusy =
    actions.respond.isPending || actions.withdraw.isPending || actions.decide.isPending;
  const error = actions.respond.error ?? actions.withdraw.error ?? actions.decide.error;
  const needsMessage = permissions.canRespond || permissions.canDecide;

  if (!needsMessage && !permissions.canWithdraw) return null;

  /** The message, or null after showing why it is needed. */
  const requiredMessage = (): string | null => {
    const trimmed = message.trim();
    if (trimmed === '') {
      setMessageError('Write a short message to explain.');
      return null;
    }
    if (trimmed.length > MESSAGE_MAX_LENGTH) {
      setMessageError('Keep the message under 1,000 characters.');
      return null;
    }
    setMessageError(null);
    return trimmed;
  };

  const confirm = (title: string, body: string, action: string, onConfirm: () => void) =>
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, onPress: onConfirm },
    ]);

  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>
          {permissions.canRespond
            ? 'Your answer'
            : permissions.canDecide
              ? 'Your decision as admin'
              : 'Your dispute'}
        </Card.Title>
        {permissions.canDecide ? (
          <Typography.Paragraph type="body-xs" color="muted">
            {creatorName} could not agree with this proposal, so an admin with no part in it
            decides.
          </Typography.Paragraph>
        ) : null}
        {needsMessage ? (
          <TextField isInvalid={messageError !== null}>
            <Label>
              {permissions.canRespond ? 'Message (needed to reject)' : 'Reason for your decision'}
            </Label>
            <TextArea
              value={message}
              onChangeText={setMessage}
              accessibilityLabel={permissions.canRespond ? 'Message' : 'Reason for your decision'}
            />
          </TextField>
        ) : null}
        <FormAlert
          message={
            messageError ??
            (error
              ? userErrorMessage(
                  error,
                  'Could not save that. Please try again.',
                  DISPUTE_ERROR_MESSAGES,
                )
              : null)
          }
        />
        {permissions.canRespond ? (
          <View className="flex-row gap-2">
            <Button
              className="flex-1"
              isDisabled={isBusy}
              onPress={() =>
                confirm(
                  'Accept the proposal?',
                  'The split changes as shown, and everyone in it can object to their new share.',
                  'Accept',
                  () => actions.respond.mutate({ accept: true, message: message.trim() || null }),
                )
              }
            >
              Accept
            </Button>
            <Button
              className="flex-1"
              variant="secondary"
              isDisabled={isBusy}
              onPress={() => {
                const text = requiredMessage();
                if (text) actions.respond.mutate({ accept: false, message: text });
              }}
            >
              Reject
            </Button>
          </View>
        ) : null}
        {permissions.canDecide ? (
          <View className="gap-2">
            <Button
              isDisabled={isBusy}
              onPress={() => {
                const text = requiredMessage();
                if (text) actions.decide.mutate({ apply: true, message: text });
              }}
            >
              Adjust the split as proposed
            </Button>
            <Button
              variant="secondary"
              isDisabled={isBusy}
              onPress={() => {
                const text = requiredMessage();
                if (text) actions.decide.mutate({ apply: false, message: text });
              }}
            >
              Keep the expense as it is
            </Button>
          </View>
        ) : null}
        {permissions.canWithdraw ? (
          <Button
            variant="ghost"
            isDisabled={isBusy}
            onPress={() =>
              confirm('Withdraw your dispute?', 'The expense stays as it is.', 'Withdraw', () =>
                actions.withdraw.mutate(),
              )
            }
          >
            Withdraw dispute
          </Button>
        ) : null}
      </Card.Body>
    </Card>
  );
}

function AddEvidence({ apartmentId, disputeId }: { apartmentId: string; disputeId: string }) {
  const { addEvidence } = useDisputeActions(apartmentId, disputeId);
  const [image, setImage] = useState<PickedImage | null>(null);

  return (
    <View className="gap-2">
      <PhotoPicker
        title="Add a photo"
        description="A receipt, a message or anything that supports your side. Photos cannot be removed."
        attachLabel="Choose photo"
        image={image}
        onChange={setImage}
        isDisabled={addEvidence.isPending}
      />
      <FormAlert
        message={addEvidence.error ? evidenceUploadErrorMessage(addEvidence.error) : null}
      />
      {image ? (
        <Button
          isDisabled={addEvidence.isPending}
          onPress={() => addEvidence.mutate(image, { onSuccess: () => setImage(null) })}
        >
          {addEvidence.isPending ? 'Uploading…' : 'Add photo'}
        </Button>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>{title}</Card.Title>
        <Separator />
        {children}
      </Card.Body>
    </Card>
  );
}
