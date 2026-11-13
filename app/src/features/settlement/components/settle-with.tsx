import { router } from 'expo-router';
import { Button, Card, Chip, PressableFeedback, Separator, Typography } from 'heroui-native';
import { View } from 'react-native';

import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { useApartment } from '@/features/apartments/hooks';
import { useRefreshMoney } from '@/features/expenses/hooks';
import { userErrorMessage } from '@/lib/errors';
import { formatMinorUnits } from '@/lib/money';
import { formatDate } from '@/lib/time';

import type { Obligation } from '../api';
import { usePairObligations } from '../hooks';
import { obligationState } from '../rules';

const STATE_COLORS = {
  settled: 'success',
  'partly settled': 'warning',
  open: 'default',
  held: 'danger',
} as const;

/**
 * The obligations between the user and one person, with how much payments
 * and offsets cover, oldest first, and the way to settle the rest (SRS
 * FR-08.3, FR-06.4, AC-09).
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

  if (apartment.isPending || obligations.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  const loadError = apartment.error ?? obligations.error;
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

  const money = (amountMinor: number) =>
    `${formatMinorUnits(amountMinor)} ${apartment.data.currency}`;
  const owe = obligations.data.filter((item) => item.direction === 'owe');
  const owed = obligations.data.filter((item) => item.direction === 'owed');
  const remaining = (items: Obligation[]) =>
    items.reduce((sum, item) => sum + (item.isHeld ? 0 : obligationState(item).remainingMinor), 0);

  return (
    <Screen
      padTop={false}
      refreshing={obligations.isRefetching}
      onRefresh={() => void refreshMoney()}
    >
      <Typography.Paragraph type="body-sm" color="muted">
        Payments and offsets settle the oldest expenses first. Disputed expenses are held and cannot
        be paid until the dispute ends.
      </Typography.Paragraph>

      <ObligationList
        title={`What you owe ${name}`}
        items={owe}
        money={money}
        apartmentId={apartmentId}
        empty={`You owe ${name} nothing for shared expenses.`}
      />
      <ObligationList
        title={`What ${name} owes you`}
        items={owed}
        money={money}
        apartmentId={apartmentId}
        empty={`${name} owes you nothing for shared expenses.`}
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
      >
        Payments and everything else with {name}
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
          items.map((item, index) => {
            const { remainingMinor, state } = obligationState(item);
            return (
              <View key={item.expenseId} className="gap-2">
                {index > 0 ? <Separator /> : null}
                <PressableFeedback
                  onPress={() =>
                    router.push({
                      pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
                      params: { apartmentId, expenseId: item.expenseId },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}, ${money(item.amountMinor)}, ${state}`}
                  className="flex-row items-center gap-3"
                >
                  <View className="flex-1 gap-0.5">
                    <Typography.Paragraph type="body-sm">{item.title}</Typography.Paragraph>
                    <Typography.Paragraph type="body-xs" color="muted">
                      {formatDate(item.expenseDate)} · {money(item.amountMinor)}
                      {state === 'partly settled' ? ` · ${money(remainingMinor)} left` : ''}
                    </Typography.Paragraph>
                  </View>
                  <Chip size="sm" variant="soft" color={STATE_COLORS[state]}>
                    {state === 'settled'
                      ? 'Settled'
                      : state === 'held'
                        ? 'Held'
                        : state === 'open'
                          ? 'Open'
                          : 'Partly settled'}
                  </Chip>
                </PressableFeedback>
              </View>
            );
          })
        )}
      </Card.Body>
    </Card>
  );
}
