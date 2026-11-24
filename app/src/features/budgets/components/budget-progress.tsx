import { Card, Typography } from 'heroui-native';
import { View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { useCategories } from '@/features/apartments/hooks';
import { formatMonth } from '@/lib/time';

import type { Budget } from '../api';
import { useBudgets } from '../hooks';
import { type BudgetLevel, budgetLevel, budgetPercent, describeBudget } from '../progress';

const BAR_COLOR: Record<BudgetLevel, string> = {
  under: 'bg-success',
  near: 'bg-warning',
  over: 'bg-danger',
};

const LEVEL_TEXT: Record<BudgetLevel, string | undefined> = {
  under: undefined,
  near: 'text-warning',
  over: 'text-danger',
};

/**
 * The apartment's budgets against the spending of the month shown on the
 * dashboard (FR-10.3). Shows nothing when the apartment has none.
 */
export function BudgetProgress({
  apartmentId,
  month,
  currency,
}: {
  apartmentId: string;
  month: string;
  currency: string;
}) {
  const budgets = useBudgets(apartmentId, month);
  const categories = useCategories(apartmentId);

  if (budgets.isLoadingError) {
    return (
      <Typography.Paragraph type="body-sm" color="muted">
        Could not load the budgets. Pull down to try again.
      </Typography.Paragraph>
    );
  }
  // Nothing while loading, so the many apartments without budgets never jump.
  if (!budgets.data || budgets.data.length === 0) return null;

  const names = new Map(categories.data?.map((category) => [category.id, category.name]));
  const nameOf = (budget: Budget) =>
    budget.categoryId === null ? 'All spending' : (names.get(budget.categoryId) ?? 'A category');

  return (
    <Card>
      <Card.Body className="gap-4">
        <Typography.Paragraph weight="semibold">
          Budgets for {formatMonth(month)}
        </Typography.Paragraph>
        {budgets.data.map((budget) => {
          const level = budgetLevel(budget.spentMinor, budget.limitMinor);
          const { spent, remaining } = describeBudget(
            budget.spentMinor,
            budget.limitMinor,
            currency,
          );
          return (
            <View
              key={budget.id}
              className="gap-2"
              accessible
              accessibilityLabel={`${nameOf(budget)}: ${spent}, ${remaining}`}
            >
              <View className="flex-row items-baseline justify-between gap-2">
                <Typography.Paragraph type="body-sm" numberOfLines={1} className="shrink">
                  {nameOf(budget)}
                </Typography.Paragraph>
                <Typography.Paragraph type="body-sm">{spent}</Typography.Paragraph>
              </View>
              <ProgressBar
                percent={budgetPercent(budget.spentMinor, budget.limitMinor)}
                className={BAR_COLOR[level]}
              />
              {LEVEL_TEXT[level] ? (
                <Typography.Paragraph
                  type="body-xs"
                  weight="semibold"
                  className={LEVEL_TEXT[level]}
                >
                  {remaining}
                </Typography.Paragraph>
              ) : (
                <Typography.Paragraph type="body-xs" color="muted">
                  {remaining}
                </Typography.Paragraph>
              )}
            </View>
          );
        })}
      </Card.Body>
    </Card>
  );
}
