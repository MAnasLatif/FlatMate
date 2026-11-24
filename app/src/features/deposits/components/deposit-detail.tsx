import { router } from 'expo-router';
import { Card, Separator, Typography } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useConfirm } from '@/components/confirm-dialog';
import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { formatMoney } from '@/features/apartments/currencies';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { userErrorMessage } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/time';
import { randomUuid } from '@/lib/uuid';

import { DEPOSIT_ERROR_MESSAGES } from '../errors';
import { describeDepositAction } from '../history';
import { useUndoDepositAction } from '../hooks';
import { depositState, sharesNow, undoableAction } from '../shares';
import { useDepositData } from './use-deposit-data';

const SHARE_ACTION_ROUTES = {
  takeover: '/apartments/[apartmentId]/deposits/[depositId]/takeover',
  refund: '/apartments/[apartmentId]/deposits/[depositId]/refund',
  return: '/apartments/[apartmentId]/deposits/[depositId]/return',
} as const;

type ShareAction = keyof typeof SHARE_ACTION_ROUTES;

/**
 * One deposit: who holds what now, and everything that happened to it.
 * Admins record takeovers, refunds and the return here, and can undo the
 * latest change.
 */
export function DepositDetail({
  apartmentId,
  depositId,
}: {
  apartmentId: string;
  depositId: string;
}) {
  const data = useDepositData(apartmentId);
  const undo = useUndoDepositAction(apartmentId);
  const { confirm, dialog } = useConfirm();
  // One id per undo the user asks for, so a retry cannot undo twice.
  const [undoRequestId, setUndoRequestId] = useState(randomUuid);
  useMarkSeen(unreadMatches.deposit(apartmentId, depositId));

  if (data.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  if (data.error || !data.apartment.data || !data.deposits.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(data.error, 'Could not load the deposit.')}
          onRetry={data.retry}
        />
      </Screen>
    );
  }
  const deposit = data.deposits.data.find((item) => item.id === depositId);
  if (!deposit) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message="This deposit is not available." />
      </Screen>
    );
  }

  const currency = data.apartment.data.currency;
  const money = (amountMinor: number) => formatMoney(amountMinor, currency);
  const shares = sharesNow(deposit);
  const state = depositState(deposit);
  const latest = undoableAction(deposit);
  const open = (action: ShareAction) =>
    router.push({ pathname: SHARE_ACTION_ROUTES[action], params: { apartmentId, depositId } });
  const history = [...deposit.actions].reverse();

  return (
    <Screen freshness={data.deposits} padTop={false}>
      <View className="gap-1">
        <Typography.Heading type="h5">{deposit.title}</Typography.Heading>
        <Typography.Paragraph type="body-sm" color="muted">
          {money(deposit.amountMinor)}, paid {formatDate(deposit.paidOn)}
          {deposit.heldBy ? ` to ${deposit.heldBy}` : ''}
        </Typography.Paragraph>
      </View>
      {state === 'cancelled' ? (
        <FormAlert status="warning" message="This deposit was cancelled. Nothing is held." />
      ) : null}

      <Card>
        <Card.Body className="gap-3">
          <Typography.Paragraph weight="semibold">Held now</Typography.Paragraph>
          {shares.length === 0 ? (
            <Typography.Paragraph type="body-sm" color="muted">
              Nothing. Every share has been refunded.
            </Typography.Paragraph>
          ) : (
            shares.map((share) => (
              <View key={share.userId} className="flex-row justify-between gap-2">
                <Typography.Paragraph type="body-sm" className="shrink">
                  {data.nameOf(share.userId)}
                </Typography.Paragraph>
                <Typography.Paragraph type="body-sm">
                  {money(share.amountMinor)}
                </Typography.Paragraph>
              </View>
            ))
          )}
        </Card.Body>
      </Card>

      {data.isAdmin && state === 'held' ? (
        <View className="gap-3">
          <OnlineButton variant="secondary" onPress={() => open('takeover')}>
            Someone takes over a share
          </OnlineButton>
          <OnlineButton variant="secondary" onPress={() => open('refund')}>
            Landlord refunds one share
          </OnlineButton>
          <OnlineButton variant="secondary" onPress={() => open('return')}>
            Landlord returns the deposit
          </OnlineButton>
        </View>
      ) : null}

      <FormAlert
        message={
          undo.error
            ? userErrorMessage(undo.error, 'Could not undo the change.', DEPOSIT_ERROR_MESSAGES)
            : null
        }
      />

      <Card>
        <Card.Body className="gap-3">
          <Typography.Paragraph weight="semibold">History</Typography.Paragraph>
          {history.map((action, index) => (
            <View key={action.id} className="gap-1">
              {index > 0 ? <Separator className="mb-2" /> : null}
              <Typography.Paragraph type="body-sm">
                {describeDepositAction(action, deposit, data.nameOf, currency)}
              </Typography.Paragraph>
              {action.deductions.map((deduction, at) => (
                <Typography.Paragraph key={at} type="body-xs" color="muted">
                  Kept {money(deduction.amountMinor)}: {deduction.reason}
                </Typography.Paragraph>
              ))}
              <Typography.Paragraph type="body-xs" color="muted">
                {formatDateTime(new Date(action.createdAt))}
              </Typography.Paragraph>
            </View>
          ))}
        </Card.Body>
      </Card>

      {data.isAdmin && latest ? (
        <OnlineButton
          variant="danger-soft"
          isDisabled={undo.isPending}
          onPress={() =>
            confirm({
              title: 'Undo the latest change?',
              description: `${describeDepositAction(latest, deposit, data.nameOf, currency)}. Its shares and any debts it created are reversed, and the undo stays in the history.`,
              confirmLabel: 'Undo',
              isDestructive: true,
              onConfirm: () =>
                undo.mutate(
                  { actionId: latest.id, requestId: undoRequestId },
                  { onSuccess: () => setUndoRequestId(randomUuid()) },
                ),
            })
          }
        >
          {undo.isPending ? 'Undoing…' : 'Undo the latest change'}
        </OnlineButton>
      ) : null}
      {dialog}
    </Screen>
  );
}
