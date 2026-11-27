import { BottomSheet, PressableFeedback, Typography } from 'heroui-native';
import { View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Sheet } from '@/components/sheet';
import { formatMoney } from '@/features/apartments/currencies';
import { userErrorMessage } from '@/lib/errors';
import { formatMonth } from '@/lib/time';

import type { MonthSpending } from '../api';
import { barPercent, COMPARISON_MONTHS, describeChange } from '../comparison';
import { useMonthlySpending } from '../hooks';

type SpendingComparisonSheetProps = {
  apartmentId: string;
  currency: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Opens a month's expenses on the dashboard. */
  onSelectMonth: (month: string) => void;
};

/**
 * The apartment's spending and the user's share over the last six months
 * (FR-10.1), newest first. Cancelled expenses are left out; bills not paid
 * yet count in their month. Tapping a month shows its expenses.
 */
export function SpendingComparisonSheet({
  apartmentId,
  currency,
  isOpen,
  onOpenChange,
  onSelectMonth,
}: SpendingComparisonSheetProps) {
  // The comparison loads only while the sheet is open.
  return (
    <Sheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Content>
        <Comparison
          apartmentId={apartmentId}
          currency={currency}
          onSelectMonth={(month) => {
            onSelectMonth(month);
            onOpenChange(false);
          }}
        />
      </BottomSheet.Content>
    </Sheet>
  );
}

function Comparison({
  apartmentId,
  currency,
  onSelectMonth,
}: {
  apartmentId: string;
  currency: string;
  onSelectMonth: (month: string) => void;
}) {
  const spending = useMonthlySpending(apartmentId, COMPARISON_MONTHS);

  return (
    <View className="gap-4">
      <BottomSheet.Title>Compare months</BottomSheet.Title>
      <View className="flex-row gap-4">
        <Legend className="bg-accent" label="Apartment total" />
        <Legend className="bg-success" label="Your share" />
      </View>
      {spending.isPending ? (
        <LoadingRows count={3} />
      ) : spending.isLoadingError ? (
        <LoadError
          message={userErrorMessage(spending.error, 'Could not load the comparison.')}
          onRetry={() => void spending.refetch()}
        />
      ) : (
        <MonthRows months={spending.data} currency={currency} onSelectMonth={onSelectMonth} />
      )}
    </View>
  );
}

function MonthRows({
  months,
  currency,
  onSelectMonth,
}: {
  months: MonthSpending[];
  currency: string;
  onSelectMonth: (month: string) => void;
}) {
  const largest = Math.max(0, ...months.map((month) => month.totalMinor));
  if (largest === 0) {
    return (
      <Typography.Paragraph color="muted" className="py-6 text-center">
        No expenses in the last {COMPARISON_MONTHS} months yet.
      </Typography.Paragraph>
    );
  }

  // The server lists oldest first; the newest month reads first here.
  const newestFirst = months
    .map((month, index) => ({ month, previous: months[index - 1] }))
    .reverse();

  return (
    <View className="gap-1">
      {newestFirst.map(({ month, previous }) => {
        const total = formatMoney(month.totalMinor, currency);
        const share = formatMoney(month.myShareMinor, currency);
        const change = describeChange(month, previous, currency);
        return (
          <PressableFeedback
            key={month.month}
            onPress={() => onSelectMonth(month.month)}
            accessibilityRole="button"
            accessibilityLabel={`${formatMonth(month.month)}: apartment total ${total}, your share ${share}.${change ? ` ${change}.` : ''}`}
            accessibilityHint="Shows this month's expenses"
            className="gap-2 rounded-xl py-3"
          >
            <View className="flex-row items-baseline justify-between gap-2">
              <Typography.Paragraph weight="semibold">
                {formatMonth(month.month)}
              </Typography.Paragraph>
              <Typography.Paragraph type="body-sm">{total}</Typography.Paragraph>
            </View>
            <ProgressBar percent={barPercent(month.totalMinor, largest)} className="bg-accent" />
            <ProgressBar percent={barPercent(month.myShareMinor, largest)} className="bg-success" />
            <View className="flex-row justify-between gap-2">
              <Typography.Paragraph type="body-xs" color="muted">
                Your share {share}
              </Typography.Paragraph>
              {change ? (
                <Typography.Paragraph type="body-xs" color="muted">
                  {change}
                </Typography.Paragraph>
              ) : null}
            </View>
          </PressableFeedback>
        );
      })}
    </View>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className={`size-3 rounded-full ${className}`} />
      <Typography.Paragraph type="body-xs" color="muted">
        {label}
      </Typography.Paragraph>
    </View>
  );
}
