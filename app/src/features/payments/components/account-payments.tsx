import { router } from 'expo-router';
import { Button, Typography } from 'heroui-native';
import { useMemo } from 'react';
import { View } from 'react-native';

import { LoadError, LoadingRows } from '@/components/query-states';
import { useDisplayNames } from '@/features/profile/hooks';
import { userErrorMessage } from '@/lib/errors';

import { useAccountPayments } from '../hooks';
import { PaymentRow } from './payment-row';

/**
 * Payments flatmates recorded into one of the user's accounts, for the account
 * details screen. Each is the payer's claim, with its own status, not a bank record.
 */
export function AccountPayments({ accountId }: { accountId: string }) {
  const payments = useAccountPayments(accountId);
  const items = useMemo(() => payments.data?.pages.flat() ?? [], [payments.data]);
  const payerIds = useMemo(() => [...new Set(items.map((item) => item.payerId))], [items]);
  const names = useDisplayNames(payerIds);

  return (
    <View className="gap-3">
      <Typography.Heading type="h6">Payments into this account</Typography.Heading>
      {payments.isPending ? (
        <LoadingRows count={2} />
      ) : payments.isLoadingError ? (
        <LoadError
          message={userErrorMessage(payments.error, 'Payments are not available right now.')}
          onRetry={() => void payments.refetch()}
        />
      ) : items.length === 0 ? (
        <Typography.Paragraph type="body-sm" color="muted">
          No payments yet. When flatmates record a payment, they can say it went into this account.
        </Typography.Paragraph>
      ) : (
        items.map((payment) => (
          <PaymentRow
            key={payment.id}
            payment={payment}
            description={`${names.data?.[payment.payerId] ?? 'A flatmate'} paid you`}
            onPress={() =>
              router.push({
                pathname: '/apartments/[apartmentId]/payments/[paymentId]',
                params: { apartmentId: payment.apartmentId, paymentId: payment.id },
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
    </View>
  );
}
