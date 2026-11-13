import { Card, Chip, Separator, Skeleton, Typography } from 'heroui-native';
import { useMemo } from 'react';
import { View } from 'react-native';

import { LoadError } from '@/components/query-states';
import { userErrorMessage } from '@/lib/errors';
import { formatMinorUnits } from '@/lib/money';
import { ordinal } from '@/lib/time';

import { summarizeBalances } from '../balances';
import { useMyBalances } from '../hooks';

/** What the signed-in user will receive, owes and nets to in an apartment (SRS FR-06.1). */
export function BalanceSummary({
  apartmentId,
  currency,
  settlementDay,
}: {
  apartmentId: string;
  currency: string;
  settlementDay: number;
}) {
  const balances = useMyBalances(apartmentId);
  const summary = useMemo(
    () => (balances.data ? summarizeBalances(balances.data) : null),
    [balances.data],
  );

  if (balances.isPending) {
    return <Skeleton className="h-44 rounded-2xl" accessibilityLabel="Loading balances" />;
  }
  if (!summary) {
    return (
      <LoadError
        message={userErrorMessage(balances.error, 'Could not load your balances.')}
        onRetry={() => void balances.refetch()}
      />
    );
  }

  const money = (amountMinor: number) => `${formatMinorUnits(amountMinor)} ${currency}`;
  const isProvisional = summary.oweIsProvisional || summary.receiveIsProvisional;

  return (
    <Card>
      <Card.Body className="gap-4">
        <View className="flex-row gap-4">
          <Figure
            label="You'll receive"
            amount={money(summary.receiveMinor)}
            tone={summary.receiveMinor > 0 ? 'positive' : 'neutral'}
            isProvisional={summary.receiveIsProvisional}
          />
          <Figure
            label="You owe"
            amount={money(summary.oweMinor)}
            tone={summary.oweMinor > 0 ? 'negative' : 'neutral'}
            isProvisional={summary.oweIsProvisional}
          />
        </View>
        <Separator />
        <Figure
          label="Net balance"
          amount={money(Math.abs(summary.netMinor))}
          caption={
            summary.netMinor > 0
              ? 'You are owed overall'
              : summary.netMinor < 0
                ? 'You owe overall'
                : 'You are all square'
          }
          tone={summary.netMinor > 0 ? 'positive' : summary.netMinor < 0 ? 'negative' : 'neutral'}
          isProvisional={isProvisional}
        />
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
        <Typography.Paragraph type="body-xs" color="muted">
          {isProvisional ? 'Provisional amounts can still change while flatmates can object. ' : ''}
          Balances settle on the {ordinal(settlementDay)} of each month.
        </Typography.Paragraph>
      </Card.Body>
    </Card>
  );
}

const TONE_CLASSES = {
  positive: 'text-success',
  negative: 'text-danger',
  neutral: undefined,
} as const;

function Figure({
  label,
  amount,
  caption,
  tone,
  isProvisional,
}: {
  label: string;
  amount: string;
  caption?: string;
  tone: keyof typeof TONE_CLASSES;
  isProvisional: boolean;
}) {
  return (
    <View
      className="flex-1 gap-1"
      accessible
      accessibilityLabel={[label, amount, caption, isProvisional ? 'provisional' : null]
        .filter(Boolean)
        .join(', ')}
    >
      <Typography.Paragraph type="body-xs" color="muted">
        {label}
      </Typography.Paragraph>
      <Typography.Heading type="h5" className={TONE_CLASSES[tone]}>
        {amount}
      </Typography.Heading>
      {caption ? <Typography.Paragraph type="body-xs">{caption}</Typography.Paragraph> : null}
      {isProvisional ? (
        <View className="flex-row">
          <Chip size="sm" variant="soft" color="warning">
            Provisional
          </Chip>
        </View>
      ) : null}
    </View>
  );
}
