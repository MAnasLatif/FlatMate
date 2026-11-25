import { router } from 'expo-router';
import { Card, PressableFeedback, Separator, Typography } from 'heroui-native';
import { type ReactNode, useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { FreshnessBanner } from '@/components/freshness-banner';
import {
  LoadError,
  LoadingRows,
  MorePagesFooter,
  PendingSkeleton,
} from '@/components/query-states';
import { StatusChip } from '@/components/status-chip';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

import type { PairExpense } from '../api';
import { describePairNet, pairPosition } from '../balances';
import { describePairExpense } from '../position';
import { usePairBalances, usePairExpenses, useRefreshMoney } from '../hooks';
import { ExpenseStatusChips } from './expense-status';
import { formatMoney } from '@/features/apartments/currencies';

/**
 * Everything between the signed-in user and one person: what each owes the
 * other, the net, and the expenses behind it (SRS FR-06.2, FR-06.3).
 */
export function PairLedger({
  apartmentId,
  counterpartyId,
  name,
  currency,
  children,
}: {
  apartmentId: string;
  counterpartyId: string;
  name: string;
  currency: string;
  /** Sections other features add under the balance, such as payments. */
  children?: ReactNode;
}) {
  const expenses = usePairExpenses(apartmentId, counterpartyId);
  const refreshMoney = useRefreshMoney(apartmentId);
  const [refreshing, setRefreshing] = useState(false);
  const money = (amountMinor: number) => `${formatMoney(amountMinor, currency)}`;
  const items = useMemo(() => uniqueById(expenses.data?.pages.flat() ?? []), [expenses.data]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshMoney();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-5 pb-8 pt-4"
      data={items}
      keyExtractor={(item) => item.expenseId}
      renderItem={({ item }) => (
        <PairExpenseRow
          expense={item}
          name={name}
          money={money}
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
              params: { apartmentId, expenseId: item.expenseId },
            })
          }
        />
      )}
      ListHeaderComponent={
        <View className="gap-4 pb-1">
          <FreshnessBanner freshness={expenses} />
          <PairSummary
            apartmentId={apartmentId}
            counterpartyId={counterpartyId}
            name={name}
            money={money}
          />
          {children}
          <Typography.Heading type="h6" accessibilityRole="header">
            Shared expenses
          </Typography.Heading>
        </View>
      }
      ListEmptyComponent={
        expenses.isPending ? (
          <LoadingRows count={3} />
        ) : expenses.isLoadingError ? (
          <LoadError
            message={userErrorMessage(expenses.error, 'Could not load your shared expenses.')}
            onRetry={() => void expenses.refetch()}
          />
        ) : (
          <Typography.Paragraph type="body-sm" color="muted">
            No expenses between you and {name} yet.
          </Typography.Paragraph>
        )
      }
      ListFooterComponent={<MorePagesFooter pages={expenses} noun="expenses" />}
      onEndReached={() => {
        if (
          expenses.hasNextPage &&
          !expenses.isFetchingNextPage &&
          !expenses.isFetchNextPageError
        ) {
          void expenses.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    />
  );
}

function PairSummary({
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
  const balances = usePairBalances(apartmentId);

  if (balances.isPending) {
    return <PendingSkeleton className="h-40 rounded-2xl" accessibilityLabel="Loading balances" />;
  }
  if (balances.isLoadingError) {
    return (
      <LoadError
        message={userErrorMessage(balances.error, 'Could not load your balance.')}
        onRetry={() => void balances.refetch()}
      />
    );
  }

  const position = pairPosition(
    balances.data.find((balance) => balance.counterpartyId === counterpartyId),
  );
  const held = [
    position.heldOwedMinor > 0 ? `${money(position.heldOwedMinor)} to you` : null,
    position.heldOweMinor > 0 ? `${money(position.heldOweMinor)} from you` : null,
  ].filter(Boolean);

  return (
    <Card>
      <Card.Body className="gap-3">
        <AmountLine label={`${name} owes you`} amount={money(position.owedMinor)} />
        <AmountLine label={`You owe ${name}`} amount={money(position.oweMinor)} />
        <Separator />
        <View className="gap-1" accessible>
          <Typography.Heading
            type="h5"
            className={
              position.netMinor > 0
                ? 'text-success'
                : position.netMinor < 0
                  ? 'text-danger'
                  : undefined
            }
          >
            {describePairNet(position, name, money)}
          </Typography.Heading>
          {position.isProvisional ? (
            <View className="flex-row items-center gap-2">
              <StatusChip size="sm" variant="soft" color="warning">
                Provisional
              </StatusChip>
              <Typography.Paragraph type="body-xs" color="muted" className="flex-1">
                Some of this can still change while flatmates can object.
              </Typography.Paragraph>
            </View>
          ) : null}
        </View>
        {held.length > 0 ? (
          <Typography.Paragraph type="body-xs" color="muted">
            Held by open disputes and not counted above: {held.join(', ')}.
          </Typography.Paragraph>
        ) : null}
      </Card.Body>
    </Card>
  );
}

function AmountLine({ label, amount }: { label: string; amount: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3" accessible>
      <Typography.Paragraph type="body-sm" className="flex-1">
        {label}
      </Typography.Paragraph>
      <Typography.Paragraph type="body-sm" weight="semibold">
        {amount}
      </Typography.Paragraph>
    </View>
  );
}

function PairExpenseRow({
  expense,
  name,
  money,
  onPress,
}: {
  expense: PairExpense;
  name: string;
  money: (amountMinor: number) => string;
  onPress: () => void;
}) {
  const effect = describePairExpense(expense, name, money);

  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Opens the expense"
      className="rounded-3xl"
    >
      <Card>
        <Card.Body className="flex-row items-center gap-3">
          <View className="flex-1 gap-1">
            <Typography.Paragraph numberOfLines={1}>{expense.title}</Typography.Paragraph>
            <Typography.Paragraph type="body-xs" color="muted">
              {formatDate(expense.expenseDate)}
            </Typography.Paragraph>
            <Typography.Paragraph type="body-sm">{effect}</Typography.Paragraph>
          </View>
          <ExpenseStatusChips
            expense={{ status: expense.status, paid_status: expense.paidStatus }}
          />
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}

function uniqueById(items: PairExpense[]): PairExpense[] {
  const seen = new Set<string>();
  return items.filter((item) =>
    seen.has(item.expenseId) ? false : (seen.add(item.expenseId), true),
  );
}
