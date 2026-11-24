import { router } from 'expo-router';
import { Card, PressableFeedback, Typography } from 'heroui-native';
import { View } from 'react-native';

import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { StatusChip } from '@/components/status-chip';
import { formatMoney } from '@/features/apartments/currencies';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

import type { Deposit } from '../api';
import { type DepositState, depositState, sharesNow } from '../shares';
import { useDepositData } from './use-deposit-data';

const STATE_LABEL: Record<DepositState, string> = {
  held: 'Held',
  settled: 'Returned',
  cancelled: 'Cancelled',
};

/**
 * The apartment's security deposits (FR-10.4): what each was, and what the
 * user holds of it. Admins record a new one here.
 */
export function DepositList({ apartmentId }: { apartmentId: string }) {
  const data = useDepositData(apartmentId);
  useMarkSeen(unreadMatches.deposits(apartmentId));

  if (data.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  if (data.error || !data.apartment.data || !data.deposits.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(data.error, 'Could not load the deposits.')}
          onRetry={data.retry}
        />
      </Screen>
    );
  }
  const currency = data.apartment.data.currency;

  return (
    <Screen freshness={data.deposits} padTop={false}>
      <Typography.Paragraph type="body-sm" color="muted">
        The deposit paid to the landlord, and what each person holds of it. When someone moves out,
        an admin records their refund or who took their share over.
      </Typography.Paragraph>
      {data.deposits.data.length === 0 ? (
        <Typography.Paragraph color="muted" className="py-10 text-center">
          No deposit recorded yet.
        </Typography.Paragraph>
      ) : null}
      {data.deposits.data.map((deposit) => (
        <DepositCard
          key={deposit.id}
          deposit={deposit}
          currency={currency}
          myShareMinor={
            sharesNow(deposit).find((share) => share.userId === data.userId)?.amountMinor ?? 0
          }
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/deposits/[depositId]',
              params: { apartmentId, depositId: deposit.id },
            })
          }
        />
      ))}
      {data.isAdmin ? (
        <OnlineButton
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/deposits/new',
              params: { apartmentId },
            })
          }
        >
          Record a deposit
        </OnlineButton>
      ) : null}
    </Screen>
  );
}

function DepositCard({
  deposit,
  currency,
  myShareMinor,
  onPress,
}: {
  deposit: Deposit;
  currency: string;
  myShareMinor: number;
  onPress: () => void;
}) {
  const state = depositState(deposit);
  const total = formatMoney(deposit.amountMinor, currency);
  const mine = formatMoney(myShareMinor, currency);
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${deposit.title}, ${total}, ${STATE_LABEL[state]}, you hold ${mine}`}
      className="rounded-3xl"
    >
      <Card>
        <Card.Body className="gap-2">
          <View className="flex-row items-center justify-between gap-2">
            <Typography.Paragraph weight="semibold" numberOfLines={1} className="shrink">
              {deposit.title}
            </Typography.Paragraph>
            <StatusChip size="sm" variant="soft" color={state === 'held' ? 'accent' : 'default'}>
              {STATE_LABEL[state]}
            </StatusChip>
          </View>
          <Typography.Paragraph type="body-sm">
            {total}, paid {formatDate(deposit.paidOn)}
            {deposit.heldBy ? ` to ${deposit.heldBy}` : ''}
          </Typography.Paragraph>
          <Typography.Paragraph type="body-xs" color="muted">
            You hold {mine}
          </Typography.Paragraph>
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
