import { Card, Separator, Typography } from 'heroui-native';
import { View } from 'react-native';

import { LoadError, PendingSkeleton } from '@/components/query-states';
import { userErrorMessage } from '@/lib/errors';

import { usePairObligations } from '../hooks';
import { ObligationRow } from './obligation-row';

/**
 * The debts between the user and one person that do not come from an
 * expense: simplifications, deposits and adjustments. They count in the
 * balance, so the ledger lists them next to the expenses. Shows nothing when
 * there are none.
 */
export function OtherDebts({
  apartmentId,
  counterpartyId,
  name,
  money,
}: {
  apartmentId: string;
  counterpartyId: string;
  name: string;
  money: (amountMinor: number) => string;
}) {
  const obligations = usePairObligations(apartmentId, counterpartyId);

  if (obligations.isPending) {
    return (
      <PendingSkeleton className="h-24 rounded-2xl" accessibilityLabel="Loading other debts" />
    );
  }
  if (obligations.isLoadingError) {
    return (
      <LoadError
        message={userErrorMessage(obligations.error, 'Could not load your other debts.')}
        onRetry={() => void obligations.refetch()}
      />
    );
  }

  const items = obligations.data.filter((item) => item.source !== 'expense');
  if (items.length === 0) return null;

  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>Other debts</Card.Title>
        <Typography.Paragraph type="body-xs" color="muted">
          From simplified debts, deposits and adjustments.
        </Typography.Paragraph>
        {items.map((item, index) => (
          <View key={`${item.direction}-${item.source}-${item.sourceId}`} className="gap-2">
            {index > 0 ? <Separator /> : null}
            <ObligationRow
              item={item}
              apartmentId={apartmentId}
              money={money}
              who={item.direction === 'owe' ? `You owe ${name}` : `${name} owes you`}
            />
          </View>
        ))}
      </Card.Body>
    </Card>
  );
}
