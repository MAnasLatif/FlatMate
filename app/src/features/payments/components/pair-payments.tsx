import { router } from 'expo-router';
import { Button, Card, Chip, PressableFeedback, Separator, Typography } from 'heroui-native';
import { useMemo } from 'react';
import { View } from 'react-native';

import { LoadError, LoadingRows } from '@/components/query-states';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { pairPosition } from '@/features/expenses/balances';
import { usePairBalances } from '@/features/expenses/hooks';
import { userErrorMessage } from '@/lib/errors';
import { formatMinorUnits } from '@/lib/money';
import { formatDate } from '@/lib/time';

import type { Payment } from '../api';
import { usePairPayments } from '../hooks';
import { paymentStatus } from '../rules';

/** Payments between the user and one person, and a way to pay them, for the pairwise ledger (SRS FR-06.3). */
export function PairPayments({
  apartmentId,
  counterpartyId,
  name,
}: {
  apartmentId: string;
  counterpartyId: string;
  name: string;
}) {
  const userId = useCurrentUserId();
  const payments = usePairPayments(apartmentId, counterpartyId);
  const balances = usePairBalances(apartmentId);
  const owe = balances.data
    ? pairPosition(balances.data.find((balance) => balance.counterpartyId === counterpartyId))
        .oweMinor
    : 0;
  const items = useMemo(() => payments.data?.pages.flat() ?? [], [payments.data]);

  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>Payments</Card.Title>
        <Separator />
        {owe > 0 ? (
          <Button
            onPress={() =>
              router.push({
                pathname: '/apartments/[apartmentId]/pay/[memberId]',
                params: { apartmentId, memberId: counterpartyId },
              })
            }
          >
            {`Pay ${name}`}
          </Button>
        ) : null}
        {payments.isPending ? (
          <LoadingRows count={2} />
        ) : payments.isError ? (
          <LoadError
            message={userErrorMessage(payments.error, 'Could not load your payments.')}
            onRetry={() => void payments.refetch()}
          />
        ) : items.length === 0 ? (
          <Typography.Paragraph type="body-sm" color="muted">
            No payments between you and {name} yet.
          </Typography.Paragraph>
        ) : (
          items.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              description={payment.payerId === userId ? `You paid ${name}` : `${name} paid you`}
              onPress={() =>
                router.push({
                  pathname: '/apartments/[apartmentId]/payments/[paymentId]',
                  params: { apartmentId, paymentId: payment.id },
                })
              }
            />
          ))
        )}
        {payments.hasNextPage ? (
          <Button
            variant="ghost"
            isDisabled={payments.isFetchingNextPage}
            onPress={() => void payments.fetchNextPage()}
          >
            {payments.isFetchingNextPage ? 'Loading…' : 'Show older payments'}
          </Button>
        ) : null}
      </Card.Body>
    </Card>
  );
}

function PaymentRow({
  payment,
  description,
  onPress,
}: {
  payment: Payment;
  description: string;
  onPress: () => void;
}) {
  const status = paymentStatus(payment.status);
  const amount = `${formatMinorUnits(payment.amountMinor)} ${payment.currency}`;
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${description} ${amount}, ${status.label}`}
      className="flex-row items-center gap-3"
    >
      <View className="flex-1 gap-0.5">
        <Typography.Paragraph type="body-sm">
          {description} {amount}
        </Typography.Paragraph>
        <Typography.Paragraph type="body-xs" color="muted">
          {formatDate(payment.paidAt)}
        </Typography.Paragraph>
      </View>
      <Chip size="sm" variant="soft" color={status.color}>
        {status.label}
      </Chip>
    </PressableFeedback>
  );
}
