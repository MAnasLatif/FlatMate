import { router } from 'expo-router';
import { Button, LinkButton, Typography } from 'heroui-native';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { FreshnessBanner } from '@/components/freshness-banner';
import {
  LoadError,
  LoadingRows,
  MorePagesFooter,
  PendingSkeleton,
} from '@/components/query-states';
import { useHeaderShadowOnScroll } from '@/components/use-header-shadow-on-scroll';
import type { Apartment } from '@/features/apartments/api';
import { useApartment } from '@/features/apartments/hooks';
import { useIsUnread } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { userErrorMessage } from '@/lib/errors';
import { formatMonth, monthStart, todayInTimeZone } from '@/lib/time';

import type { ExpenseListItem } from '../api';
import { useExpenses, useMyMonthlyShare, useRefreshMoney } from '../hooks';
import { BalanceSummary, type ExpenseFilter } from './balance-summary';
import { ExpenseRow } from './expense-row';
import { activeFilterCount, type ExpenseSearch, NO_SEARCH } from '../search';
import { ActiveFilters } from './active-filters';
import { ExpenseFilterSheet } from './expense-filter-sheet';
import { MonthSelector } from './month-selector';
import { SpendingComparisonSheet } from './spending-comparison';
import { formatMoney } from '@/features/apartments/currencies';

/** An apartment's main screen: the user's balances, then a month of expenses (SRS 3.2). */
export function Dashboard({ apartment }: { apartment: Apartment }) {
  const latestMonth = monthStart(todayInTimeZone(apartment.timezone));
  const [month, setMonth] = useState(latestMonth);
  const [search, setSearch] = useState<ExpenseSearch>(NO_SEARCH);
  const [isFilterOpen, setFilterOpen] = useState(false);
  const [isComparisonOpen, setComparisonOpen] = useState(false);
  const expenses = useExpenses(apartment.id, month, search);
  const isSearching = activeFilterCount(search) > 0;
  const refreshMoney = useRefreshMoney(apartment.id);
  const apartmentQuery = useApartment(apartment.id);
  const [refreshing, setRefreshing] = useState(false);
  const isUnread = useIsUnread();
  const headerShadow = useHeaderShadowOnScroll();
  const [filter, setFilter] = useState<ExpenseFilter | null>(null);

  // Pages are fetched by offset, so an expense added while scrolling can appear twice.
  const loaded = useMemo(() => uniqueById(expenses.data?.pages.flat() ?? []), [expenses.data]);
  const items = useMemo(
    () => (filter ? loaded.filter((item) => matchesFilter(item, filter)) : loaded),
    [loaded, filter],
  );

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
      {...headerShadow}
      testID="dashboard-list"
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-5 pb-8 pt-4"
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ExpenseRow
          expense={item}
          unread={isUnread(unreadMatches.expenseRow(apartment.id, item.id))}
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
          <FreshnessBanner freshness={expenses} />
          <BalanceSummary
            apartmentId={apartment.id}
            currency={apartment.currency}
            filter={filter}
            onFilterChange={setFilter}
          />
          <MonthSelector month={month} latestMonth={latestMonth} onChange={setMonth} />
          <View className="flex-row items-center justify-between gap-2">
            <MonthlyShare apartmentId={apartment.id} month={month} currency={apartment.currency} />
            <LinkButton
              onPress={() => setComparisonOpen(true)}
              accessibilityLabel="Compare months"
              hitSlop={12}
            >
              <LinkButton.Label className="font-semibold text-accent">Compare</LinkButton.Label>
            </LinkButton>
          </View>
          <ActiveFilters
            apartmentId={apartment.id}
            currency={apartment.currency}
            search={search}
            onChange={setSearch}
            onOpen={() => setFilterOpen(true)}
          />
          <ExpenseFilterSheet
            apartmentId={apartment.id}
            currency={apartment.currency}
            isOpen={isFilterOpen}
            onOpenChange={setFilterOpen}
            search={search}
            onApply={setSearch}
          />
          <SpendingComparisonSheet
            apartmentId={apartment.id}
            currency={apartment.currency}
            isOpen={isComparisonOpen}
            onOpenChange={setComparisonOpen}
            onSelectMonth={setMonth}
          />
        </View>
      }
      ListEmptyComponent={
        expenses.isPending ? (
          <LoadingRows count={3} />
        ) : expenses.isLoadingError ? (
          <LoadError
            message={userErrorMessage(expenses.error, 'Could not load the expenses.')}
            onRetry={() => void expenses.refetch()}
          />
        ) : isSearching && loaded.length === 0 ? (
          <View className="items-center gap-3 py-10">
            <Typography.Paragraph color="muted" className="text-center">
              No expenses in {formatMonth(month)} match these filters.
            </Typography.Paragraph>
            <Button size="sm" variant="secondary" onPress={() => setSearch(NO_SEARCH)}>
              Clear filters
            </Button>
          </View>
        ) : filter && loaded.length > 0 ? (
          <Typography.Paragraph color="muted" className="py-10 text-center">
            {filter === 'receive'
              ? `Nothing to receive from the expenses in ${formatMonth(month)}.`
              : `Nothing to send for the expenses in ${formatMonth(month)}.`}
          </Typography.Paragraph>
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
      ListFooterComponent={<MorePagesFooter pages={expenses} noun="expenses" />}
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
    return (
      <PendingSkeleton className="h-5 w-48 rounded-md" accessibilityLabel="Loading your share" />
    );
  }
  if (share.isLoadingError) {
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
        {formatMoney(share.data, currency)}
      </Typography.Paragraph>
    </Typography.Paragraph>
  );
}

/** The expenses the user receives for (paid more than their share), or sends for. */
function matchesFilter(item: ExpenseListItem, filter: ExpenseFilter): boolean {
  const position = item.my_position_minor ?? 0;
  return filter === 'receive' ? position > 0 : position < 0;
}

function uniqueById(items: ExpenseListItem[]): ExpenseListItem[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}
