import { router } from 'expo-router';
import { Card, PressableFeedback, Separator, Typography } from 'heroui-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { LoadError, PendingSkeleton } from '@/components/query-states';
import { StatusChip } from '@/components/status-chip';
import { useMembers } from '@/features/apartments/hooks';
import { userErrorMessage } from '@/lib/errors';
import { formatMinorUnits } from '@/lib/money';

import { type BalanceLine, balanceLines, summarizeBalances } from '../balances';
import { useMyBalances } from '../hooks';

type Direction = 'receive' | 'send';

/**
 * What the signed-in user will receive and send in an apartment (SRS FR-06.1),
 * as two widgets side by side. Tapping one lists the people behind it below,
 * and tapping it again hides the list.
 */
export function BalanceSummary({
  apartmentId,
  currency,
}: {
  apartmentId: string;
  currency: string;
}) {
  const balances = useMyBalances(apartmentId);
  const [shown, setShown] = useState<Direction | null>(null);
  const summary = useMemo(
    () => (balances.data ? summarizeBalances(balances.data) : null),
    [balances.data],
  );
  const lines = useMemo(
    () => (balances.data ? balanceLines(balances.data) : null),
    [balances.data],
  );

  if (balances.isPending) {
    return <PendingSkeleton className="h-28 rounded-2xl" accessibilityLabel="Loading balances" />;
  }
  if (!summary || !lines) {
    return (
      <LoadError
        message={userErrorMessage(balances.error, 'Could not load your balances.')}
        onRetry={() => void balances.refetch()}
      />
    );
  }

  const money = (amountMinor: number) => `${formatMinorUnits(amountMinor)} ${currency}`;
  const toggle = (direction: Direction) =>
    setShown((current) => (current === direction ? null : direction));

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <TotalWidget
          label="You'll receive"
          amount={money(summary.receiveMinor)}
          tone={summary.receiveMinor > 0 ? 'positive' : 'neutral'}
          isSelected={shown === 'receive'}
          hint="Lists who pays you"
          onPress={() => toggle('receive')}
        />
        <TotalWidget
          label="You'll send"
          amount={money(summary.oweMinor)}
          tone={summary.oweMinor > 0 ? 'negative' : 'neutral'}
          isSelected={shown === 'send'}
          hint="Lists whom you pay"
          onPress={() => toggle('send')}
        />
      </View>

      {shown ? (
        <BalanceList
          apartmentId={apartmentId}
          direction={shown}
          lines={shown === 'receive' ? lines.receive : lines.send}
          money={money}
        />
      ) : null}

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

const TONE_CLASSES = {
  positive: 'text-success',
  negative: 'text-danger',
  neutral: undefined,
} as const;

function TotalWidget({
  label,
  amount,
  tone,
  isSelected,
  hint,
  onPress,
}: {
  label: string;
  amount: string;
  tone: keyof typeof TONE_CLASSES;
  isSelected: boolean;
  hint: string;
  onPress: () => void;
}) {
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${amount}`}
      accessibilityHint={hint}
      accessibilityState={{ expanded: isSelected }}
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
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}

/** The people behind one total. Each opens the user's ledger with that person. */
function BalanceList({
  apartmentId,
  direction,
  lines,
  money,
}: {
  apartmentId: string;
  direction: Direction;
  lines: BalanceLine[];
  money: (amountMinor: number) => string;
}) {
  const members = useMembers(apartmentId);

  if (lines.length === 0) {
    return (
      <Card>
        <Card.Body>
          <Typography.Paragraph type="body-sm" color="muted" className="text-center">
            {direction === 'receive'
              ? 'Nobody owes you anything right now.'
              : "You don't owe anyone right now."}
          </Typography.Paragraph>
        </Card.Body>
      </Card>
    );
  }
  if (members.isPending) {
    return <PendingSkeleton className="h-16 rounded-2xl" accessibilityLabel="Loading names" />;
  }

  const nameOf = (userId: string) =>
    members.data?.find((member) => member.userId === userId)?.displayName ?? 'Unnamed member';

  return (
    <Card>
      <Card.Body className="gap-0 py-1">
        {lines.map((line, index) => {
          const name = nameOf(line.counterpartyId);
          return (
            <View key={line.counterpartyId}>
              {index > 0 ? <Separator /> : null}
              <PressableFeedback
                onPress={() =>
                  router.push({
                    pathname: '/apartments/[apartmentId]/ledger/[memberId]',
                    params: { apartmentId, memberId: line.counterpartyId },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={[
                  direction === 'receive' ? `${name} pays you` : `You pay ${name}`,
                  money(line.amountMinor),
                  line.isProvisional ? 'provisional' : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
                accessibilityHint={`Opens your ledger with ${name}`}
                className="min-h-12 flex-row items-center gap-3 py-3"
              >
                <Typography.Paragraph numberOfLines={1} className="flex-1">
                  {name}
                </Typography.Paragraph>
                {line.isProvisional ? (
                  <StatusChip size="sm" variant="soft" color="warning">
                    Provisional
                  </StatusChip>
                ) : null}
                <Typography.Paragraph
                  weight="semibold"
                  className={direction === 'receive' ? 'text-success' : 'text-danger'}
                >
                  {money(line.amountMinor)}
                </Typography.Paragraph>
              </PressableFeedback>
            </View>
          );
        })}
      </Card.Body>
    </Card>
  );
}
