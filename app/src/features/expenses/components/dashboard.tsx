import { router } from 'expo-router';
import { Button, Skeleton, Spinner, Typography } from 'heroui-native';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { OfflineBanner } from '@/components/offline-banner';
import { LoadError, LoadingRows } from '@/components/query-states';
import type { Apartment } from '@/features/apartments/api';
import { useApartment } from '@/features/apartments/hooks';
import { userErrorMessage } from '@/lib/errors';
import { formatMinorUnits } from '@/lib/money';
import { formatMonth, monthStart, todayInTimeZone } from '@/lib/time';

import type { ExpenseListItem } from '../api';
import { useExpenses, useMyMonthlyShare, useRefreshMoney } from '../hooks';
import { BalanceSummary } from './balance-summary';
import { ExpenseRow } from './expense-row';
import { MonthSelector } from './month-selector';

/** An apartment's main screen: the user's balances, then a month of expenses (SRS 3.2). */
export function Dashboard({ apartment }: { apartment: Apartment }) {
  const latestMonth = monthStart(todayInTimeZone(apartment.timezone));
  const [month, setMonth] = useState(latestMonth);
  const expenses = useExpenses(apartment.id, month);
  const refreshMoney = useRefreshMoney(apartment.id);
  const apartmentQuery = useApartment(apartment.id);
  const [refreshing, setRefreshing] = useState(false);

  // Pages are fetched by offset, so an expense added while scrolling can appear twice.
  const items = useMemo(() => uniqueById(expenses.data?.pages.flat() ?? []), [expenses.data]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshMoney(), apartmentQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = () => {
    if (expenses.hasNextPage && !expenses.isFetchingNextPage && !expenses.isFetchNextPageError) {
      void expenses.fetchNextPage();
    }
  };

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-5 pb-8 pt-4"
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ExpenseRow
          expense={item}
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
              params: { apartmentId: apartment.id, expenseId: item.id },
            })
          }
        />
      )}
      ListHeaderComponent={
        <View className="gap-4 pb-1">
          <OfflineBanner updatedAt={expenses.dataUpdatedAt} />
          <BalanceSummary
            apartmentId={apartment.id}
            currency={apartment.currency}
            settlementDay={apartment.settlement_day}
          />
          <Button
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/apartments/[apartmentId]/settlement',
                params: { apartmentId: apartment.id },
              })
            }
          >
            Settle up
          </Button>
          <MonthSelector month={month} latestMonth={latestMonth} onChange={setMonth} />
          <MonthlyShare apartmentId={apartment.id} month={month} currency={apartment.currency} />
        </View>
      }
      ListEmptyComponent={
        expenses.isPending ? (
          <LoadingRows count={3} />
        ) : expenses.isError ? (
          <LoadError
            message={userErrorMessage(expenses.error, 'Could not load the expenses.')}
            onRetry={() => void expenses.refetch()}
          />
        ) : (
          <View className="items-center gap-2 py-10">
            <Typography.Heading type="h6" className="text-center">
              No expenses in {formatMonth(month)}
            </Typography.Heading>
            <Typography.Paragraph type="body-sm" color="muted" className="text-center">
              Tap + to add a shared cost.
            </Typography.Paragraph>
          </View>
        )
      }
      ListFooterComponent={
        expenses.isFetchingNextPage ? (
          <Spinner accessibilityLabel="Loading more expenses" className="self-center" />
        ) : expenses.isFetchNextPageError ? (
          <Button variant="secondary" onPress={() => void expenses.fetchNextPage()}>
            Could not load more. Try again
          </Button>
        ) : undefined
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    />
  );
}

function MonthlyShare({
  apartmentId,
  month,
  currency,
}: {
  apartmentId: string;
  month: string;
  currency: string;
}) {
  const share = useMyMonthlyShare(apartmentId, month);

  if (share.isPending) {
    return <Skeleton className="h-5 w-48 rounded-md" accessibilityLabel="Loading your share" />;
  }
  if (share.isError) {
    return (
      <Typography.Paragraph type="body-sm" color="muted">
        Could not load your share for this month. Pull down to try again.
      </Typography.Paragraph>
    );
  }
  return (
    <Typography.Paragraph type="body-sm">
      Your share this month:{' '}
      <Typography.Paragraph type="body-sm" weight="semibold">
        {formatMinorUnits(share.data)} {currency}
      </Typography.Paragraph>
    </Typography.Paragraph>
  );
}

function uniqueById(items: ExpenseListItem[]): ExpenseListItem[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}
