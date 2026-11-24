import { router } from 'expo-router';
import { Button, Card, Separator, Typography } from 'heroui-native';
import { View } from 'react-native';

import { LoadError, loadingError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { useApartment } from '@/features/apartments/hooks';
import { useRefreshMoney } from '@/features/expenses/hooks';
import { UnreadDot, withUnread } from '@/features/notifications/components/unread-dot';
import { useHasUnread } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { userErrorMessage } from '@/lib/errors';

import type { Obligation } from '../api';
import { usePairObligations } from '../hooks';
import { ObligationRow } from './obligation-row';
import { obligationState } from '../rules';
import { formatMoney } from '@/features/apartments/currencies';

/**
 * The debts between the user and one person, from expenses and from
 * simplifications, deposits and adjustments, with how much payments and
 * offsets cover, oldest first, and the way to settle the rest (SRS FR-06.2,
 * FR-06.3, AC-09).
 */
export function SettleWith({
  apartmentId,
  memberId,
  name,
}: {
  apartmentId: string;
  memberId: string;
  name: string;
}) {
  const apartment = useApartment(apartmentId);
  const obligations = usePairObligations(apartmentId, memberId);
  const refreshMoney = useRefreshMoney(apartmentId);
  const paymentsUnread = useHasUnread(unreadMatches.withMember(apartmentId, memberId));

  if (apartment.isPending || obligations.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  const loadError = loadingError(apartment, obligations);
  if (loadError || !apartment.data || !obligations.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load what is between you.')}
          onRetry={() => {
            void apartment.refetch();
            void obligations.refetch();
          }}
        />
      </Screen>
    );
  }

  const money = (amountMinor: number) => `${formatMoney(amountMinor, apartment.data.currency)}`;
  const owe = obligations.data.filter((item) => item.direction === 'owe');
  const owed = obligations.data.filter((item) => item.direction === 'owed');
  const remaining = (items: Obligation[]) =>
    items.reduce((sum, item) => sum + (item.isHeld ? 0 : obligationState(item).remainingMinor), 0);

  return (
    <Screen
      freshness={obligations}
      padTop={false}
      refreshing={obligations.isRefetching}
      onRefresh={() => void refreshMoney()}
    >
      <Typography.Paragraph type="body-sm" color="muted">
        Payments and offsets settle the oldest debts first. Disputed expenses are held and cannot be
        paid until the dispute ends.
      </Typography.Paragraph>

      <ObligationList
        title={`What you owe ${name}`}
        items={owe}
        money={money}
        apartmentId={apartmentId}
        empty={`You owe ${name} nothing.`}
      />
      <ObligationList
        title={`What ${name} owes you`}
        items={owed}
        money={money}
        apartmentId={apartmentId}
        empty={`${name} owes you nothing.`}
      />

      {remaining(owe) > 0 ? (
        <Button
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/pay/[memberId]',
              params: { apartmentId, memberId },
            })
          }
        >
          {remaining(owed) > 0 ? `Pay or net off with ${name}` : `Pay ${name}`}
        </Button>
      ) : null}
      <Button
        variant="secondary"
        onPress={() =>
          router.push({
            pathname: '/apartments/[apartmentId]/ledger/[memberId]',
            params: { apartmentId, memberId },
          })
        }
        accessibilityLabel={withUnread(`Payments and everything else with ${name}`, paymentsUnread)}
      >
        <Button.Label>Payments and everything else with {name}</Button.Label>
        {paymentsUnread ? <UnreadDot /> : null}
      </Button>
    </Screen>
  );
}

function ObligationList({
  title,
  items,
  money,
  apartmentId,
  empty,
}: {
  title: string;
  items: Obligation[];
  money: (amountMinor: number) => string;
  apartmentId: string;
  empty: string;
}) {
  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>{title}</Card.Title>
        {items.length === 0 ? (
          <Typography.Paragraph type="body-sm" color="muted">
            {empty}
          </Typography.Paragraph>
        ) : (
          items.map((item, index) => (
            <View key={`${item.source}-${item.sourceId}`} className="gap-2">
              {index > 0 ? <Separator /> : null}
              <ObligationRow item={item} apartmentId={apartmentId} money={money} />
            </View>
          ))
        )}
      </Card.Body>
    </Card>
  );
}
