import { Card, PressableFeedback, Typography } from 'heroui-native';
import { useMemo } from 'react';
import { View } from 'react-native';

import { LoadError, PendingSkeleton } from '@/components/query-states';
import { userErrorMessage } from '@/lib/errors';

import { summarizeBalances } from '../balances';
import { useMyBalances } from '../hooks';
import { formatMoney } from '@/features/apartments/currencies';

/** Which expenses the list below shows: those the user receives for, or sends for. */
export type ExpenseFilter = 'receive' | 'send';

/**
 * What the signed-in user will receive and send in an apartment (SRS FR-06.1),
 * as two widgets side by side. Tapping one filters the expense list below to
 * the expenses on that side, and tapping it again shows them all.
 */
export function BalanceSummary({
  apartmentId,
  currency,
  filter,
  onFilterChange,
}: {
  apartmentId: string;
  currency: string;
  filter: ExpenseFilter | null;
  onFilterChange: (filter: ExpenseFilter | null) => void;
}) {
  const balances = useMyBalances(apartmentId);
  const summary = useMemo(
    () => (balances.data ? summarizeBalances(balances.data) : null),
    [balances.data],
  );

  if (balances.isPending) {
    return <PendingSkeleton className="h-28 rounded-2xl" accessibilityLabel="Loading balances" />;
  }
  if (!summary) {
    return (
      <LoadError
        message={userErrorMessage(balances.error, 'Could not load your balances.')}
        onRetry={() => void balances.refetch()}
      />
    );
  }

  const money = (amountMinor: number) => `${formatMoney(amountMinor, currency)}`;
  const toggle = (next: ExpenseFilter) => onFilterChange(filter === next ? null : next);

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <TotalWidget
          label="You'll receive"
          amount={money(summary.receiveMinor)}
          tone={summary.receiveMinor > 0 ? 'positive' : 'neutral'}
          isProvisional={summary.receiveMinor > 0 && summary.receiveIsProvisional}
          isSelected={filter === 'receive'}
          hint="Shows only the expenses you receive money for"
          onPress={() => toggle('receive')}
        />
        <TotalWidget
          label="You'll send"
          amount={money(summary.oweMinor)}
          tone={summary.oweMinor > 0 ? 'negative' : 'neutral'}
          isProvisional={summary.oweMinor > 0 && summary.oweIsProvisional}
          isSelected={filter === 'send'}
          hint="Shows only the expenses you send money for"
          onPress={() => toggle('send')}
        />
      </View>

      {summary.heldOweMinor > 0 || summary.heldReceiveMinor > 0 ? (
        <Typography.Paragraph type="body-xs" color="muted">
          Held by open disputes and not counted above:{' '}
          {[
            summary.heldReceiveMinor > 0 ? `${money(summary.heldReceiveMinor)} to you` : null,
            summary.heldOweMinor > 0 ? `${money(summary.heldOweMinor)} from you` : null,
          ]
            .filter(Boolean)
            .join(', ')}
          .
        </Typography.Paragraph>
      ) : null}
    </View>
  );
}

// A short note instead of a chip: the figure counts provisional amounts as
// payable, since expenses are accepted by default, but it is not final yet
// (SRS section 5).
const PROVISIONAL_NOTE = 'Includes amounts not final yet';

const TONE_CLASSES = {
  positive: 'text-success',
  negative: 'text-danger',
  neutral: undefined,
} as const;

function TotalWidget({
  label,
  amount,
  tone,
  isProvisional,
  isSelected,
  hint,
  onPress,
}: {
  label: string;
  amount: string;
  tone: keyof typeof TONE_CLASSES;
  /** The figure includes amounts still inside their objection window. */
  isProvisional: boolean;
  isSelected: boolean;
  hint: string;
  onPress: () => void;
}) {
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${amount}${isProvisional ? `, ${PROVISIONAL_NOTE}` : ''}`}
      accessibilityHint={hint}
      accessibilityState={{ selected: isSelected }}
      className="flex-1 rounded-3xl"
    >
      {/* The border is always there, so selecting a widget does not move anything. */}
      <Card className={`flex-1 border-2 ${isSelected ? 'border-accent' : 'border-transparent'}`}>
        <Card.Body className="gap-1">
          <Typography.Paragraph type="body-xs" color="muted">
            {label}
          </Typography.Paragraph>
          <Typography.Heading type="h5" className={TONE_CLASSES[tone]}>
            {amount}
          </Typography.Heading>
          {isProvisional ? (
            <Typography.Paragraph type="body-xs" color="muted">
              {PROVISIONAL_NOTE}
            </Typography.Paragraph>
          ) : null}
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
