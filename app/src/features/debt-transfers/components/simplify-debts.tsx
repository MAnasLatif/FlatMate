import { Button, Card, Separator, Typography } from 'heroui-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, loadingError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { StatusChip } from '@/components/status-chip';
import { formatMoney } from '@/features/apartments/currencies';
import { useApartment, useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { memberLabel } from '@/features/expenses/member-label';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';
import { randomUuid } from '@/lib/uuid';

import type { DebtTransfer, DebtTransferStep } from '../api';
import { describeStep, STATE_LABEL, stateNow, waitingFor } from '../describe';
import { DEBT_TRANSFER_ERROR_MESSAGES } from '../errors';
import {
  useAnswerDebtTransfer,
  useDebtTransfers,
  useDebtTransferSuggestions,
  useProposeDebtTransfer,
} from '../hooks';

/**
 * Debt simplification (FR-06.5): steps that let someone pay another person
 * directly instead of through a third, proposals waiting for answers, and
 * recent ones. A step applies only once its three people have accepted.
 */
export function SimplifyDebts({ apartmentId }: { apartmentId: string }) {
  const userId = useCurrentUserId();
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);
  const transfers = useDebtTransfers(apartmentId);
  const suggestions = useDebtTransferSuggestions(apartmentId);
  const propose = useProposeDebtTransfer(apartmentId);
  const answer = useAnswerDebtTransfer(apartmentId);
  // When the screen opened, to tell which proposals have run out of time.
  const [now] = useState(Date.now);
  useMarkSeen(unreadMatches.debtTransfers(apartmentId));

  if (apartment.isPending || members.isPending || transfers.isPending || suggestions.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  const loadError = loadingError(apartment, members, transfers, suggestions);
  if (loadError || !apartment.data || !members.data || !transfers.data || !suggestions.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load the simplifications.')}
          onRetry={() => {
            void transfers.refetch();
            void suggestions.refetch();
            void members.refetch();
          }}
        />
      </Screen>
    );
  }

  const memberList = members.data;
  const nameOf = (id: string) => {
    const member = memberList.find((entry) => entry.userId === id);
    return member ? memberLabel(member, userId) : id === userId ? 'You' : 'A former member';
  };
  const money = (amountMinor: number) => formatMoney(amountMinor, apartment.data.currency);
  const open = transfers.data.filter((transfer) => stateNow(transfer, now) === 'proposed');
  const closed = transfers.data.filter((transfer) => stateNow(transfer, now) !== 'proposed');
  const error = propose.error ?? answer.error;
  const isBusy = propose.isPending || answer.isPending;

  return (
    <Screen
      freshness={transfers}
      padTop={false}
      refreshing={transfers.isRefetching || suggestions.isRefetching}
      onRefresh={() => {
        void transfers.refetch();
        void suggestions.refetch();
      }}
    >
      <Typography.Paragraph type="body-sm" color="muted">
        Fewer payments for the same result: when you owe someone who owes a third person, one of you
        can pay the third person directly. It applies only once all three of you accept, and the
        expenses and payments behind it stay as they are.
      </Typography.Paragraph>
      <FormAlert
        message={
          error
            ? userErrorMessage(
                error,
                'Could not save that. Please try again.',
                DEBT_TRANSFER_ERROR_MESSAGES,
              )
            : null
        }
      />

      {open.length > 0 ? (
        <Section title="Waiting for answers">
          {open.map((transfer, index) => (
            <View key={transfer.id} className="gap-3">
              {index > 0 ? <Separator /> : null}
              <OpenTransfer
                transfer={transfer}
                userId={userId}
                nameOf={nameOf}
                money={money(transfer.amountMinor)}
                isBusy={isBusy}
                onAnswer={(accept) => answer.mutate({ transferId: transfer.id, accept })}
              />
            </View>
          ))}
        </Section>
      ) : null}

      <Section title="Suggestions">
        {suggestions.data.length === 0 ? (
          <Typography.Paragraph type="body-sm" color="muted">
            Nothing to simplify for you right now.
          </Typography.Paragraph>
        ) : (
          suggestions.data.map((step, index) => (
            <View key={`${step.debtorId}-${step.middleId}-${step.creditorId}`} className="gap-3">
              {index > 0 ? <Separator /> : null}
              <Suggestion
                step={step}
                nameOf={nameOf}
                money={money(step.amountMinor)}
                isBusy={isBusy}
                onPropose={() => propose.mutate({ step, requestId: randomUuid() })}
              />
            </View>
          ))
        )}
      </Section>

      {closed.length > 0 ? (
        <Section title="Earlier">
          {closed.map((transfer) => {
            const { headline } = describeStep(transfer, nameOf, money(transfer.amountMinor));
            const state = stateNow(transfer, now);
            return (
              <View key={transfer.id} className="flex-row items-center justify-between gap-2">
                <View className="flex-1 gap-0.5">
                  <Typography.Paragraph type="body-sm">{headline}</Typography.Paragraph>
                  <Typography.Paragraph type="body-xs" color="muted">
                    Proposed {formatDate(transfer.createdAt)}
                  </Typography.Paragraph>
                </View>
                <StatusChip
                  size="sm"
                  variant="soft"
                  color={state === 'applied' ? 'success' : 'default'}
                >
                  {STATE_LABEL[state]}
                </StatusChip>
              </View>
            );
          })}
        </Section>
      ) : null}
    </Screen>
  );
}

function Suggestion({
  step,
  nameOf,
  money,
  isBusy,
  onPropose,
}: {
  step: DebtTransferStep;
  nameOf: (userId: string) => string;
  money: string;
  isBusy: boolean;
  onPropose: () => void;
}) {
  const { headline, detail } = describeStep(step, nameOf, money);
  return (
    <View className="gap-2">
      <Typography.Paragraph weight="semibold">{headline}</Typography.Paragraph>
      <Typography.Paragraph type="body-sm" color="muted">
        {detail}
      </Typography.Paragraph>
      <OnlineButton size="sm" variant="secondary" isDisabled={isBusy} onPress={onPropose}>
        Propose it
      </OnlineButton>
    </View>
  );
}

function OpenTransfer({
  transfer,
  userId,
  nameOf,
  money,
  isBusy,
  onAnswer,
}: {
  transfer: DebtTransfer;
  userId: string;
  nameOf: (userId: string) => string;
  money: string;
  isBusy: boolean;
  onAnswer: (accept: boolean) => void;
}) {
  const { headline, detail } = describeStep(transfer, nameOf, money);
  const waiting = waitingFor(transfer);
  const mine = transfer.answers.find((answer) => answer.userId === userId);
  const isMine = [transfer.debtorId, transfer.middleId, transfer.creditorId].includes(userId);
  return (
    <View className="gap-2">
      <Typography.Paragraph weight="semibold">{headline}</Typography.Paragraph>
      <Typography.Paragraph type="body-sm" color="muted">
        {detail}
      </Typography.Paragraph>
      <Typography.Paragraph type="body-xs" color="muted">
        Proposed by {nameOf(transfer.proposedBy).replace(/^You$/, 'you')}. Waiting for{' '}
        {waiting.map((id) => nameOf(id).replace(/^You$/, 'you')).join(' and ')}, until{' '}
        {formatDate(transfer.expiresAt)}.
      </Typography.Paragraph>
      {isMine && !mine ? (
        <View className="flex-row flex-wrap gap-2">
          <OnlineButton size="sm" isDisabled={isBusy} onPress={() => onAnswer(true)}>
            Accept
          </OnlineButton>
          <OnlineButton
            size="sm"
            variant="ghost"
            isDisabled={isBusy}
            onPress={() => onAnswer(false)}
          >
            Decline
          </OnlineButton>
        </View>
      ) : isMine ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Typography.Paragraph type="body-xs" color="muted">
            You accepted.
          </Typography.Paragraph>
          <Button size="sm" variant="ghost" isDisabled={isBusy} onPress={() => onAnswer(false)}>
            Withdraw and decline
          </Button>
        </View>
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
