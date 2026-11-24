import { router } from 'expo-router';
import { PressableFeedback, Typography } from 'heroui-native';
import { View } from 'react-native';

import { StatusChip } from '@/components/status-chip';
import { formatDate } from '@/lib/time';

import type { Obligation, ObligationSource } from '../api';
import { obligationState } from '../rules';

const STATE_COLORS = {
  settled: 'success',
  'partly settled': 'warning',
  open: 'default',
  held: 'danger',
} as const;

const STATE_LABELS = {
  settled: 'Settled',
  'partly settled': 'Partly settled',
  open: 'Open',
  held: 'Held',
} as const;

/** Said next to a debt that does not come from an expense, so it is clear what made it. */
const SOURCE_LABELS: Record<ObligationSource, string | null> = {
  expense: null,
  simplification: 'Simplified debts',
  deposit: 'Deposit',
  adjustment: 'Adjustment',
};

/** Opens the record a debt comes from. An adjustment has no screen; its title is its reason. */
function openSource(apartmentId: string, item: Obligation): (() => void) | undefined {
  switch (item.source) {
    case 'expense':
      return () =>
        router.push({
          pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
          params: { apartmentId, expenseId: item.sourceId },
        });
    case 'deposit':
      return () =>
        router.push({
          pathname: '/apartments/[apartmentId]/deposits/[depositId]',
          params: { apartmentId, depositId: item.sourceId },
        });
    case 'simplification':
      return () =>
        router.push({ pathname: '/apartments/[apartmentId]/simplify', params: { apartmentId } });
    case 'adjustment':
      return undefined;
  }
}

/**
 * One debt between the user and another person: what made it, how much, and
 * how much of it is settled. Tapping opens what it comes from.
 */
export function ObligationRow({
  item,
  apartmentId,
  money,
  who,
}: {
  item: Obligation;
  apartmentId: string;
  money: (amountMinor: number) => string;
  /** Who owes whom, when the list around it does not already say. */
  who?: string;
}) {
  const { remainingMinor, state } = obligationState(item);
  const sourceLabel = SOURCE_LABELS[item.source];
  const details = [
    formatDate(item.date),
    sourceLabel,
    who,
    money(item.amountMinor),
    state === 'partly settled' ? `${money(remainingMinor)} left` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const label = [item.title, sourceLabel, who, money(item.amountMinor), state]
    .filter(Boolean)
    .join(', ');
  const onPress = openSource(apartmentId, item);

  const content = (
    <>
      <View className="flex-1 gap-0.5">
        <Typography.Paragraph type="body-sm">{item.title}</Typography.Paragraph>
        <Typography.Paragraph type="body-xs" color="muted">
          {details}
        </Typography.Paragraph>
      </View>
      <StatusChip size="sm" variant="soft" color={STATE_COLORS[state]}>
        {STATE_LABELS[state]}
      </StatusChip>
    </>
  );

  return onPress ? (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-3"
    >
      {content}
    </PressableFeedback>
  ) : (
    <View accessible accessibilityLabel={label} className="flex-row items-center gap-3">
      {content}
    </View>
  );
}
