import { router } from 'expo-router';
import { Button, Card, Separator, Typography } from 'heroui-native';
import { View } from 'react-native';

import { useCurrentUserId } from '@/features/auth/session-provider';
import { useDisplayNames } from '@/features/profile/hooks';
import { formatMinorUnits } from '@/lib/money';
import { formatDate } from '@/lib/time';

import { useMyExits } from '../hooks';

/**
 * Apartments the user left or was removed from, with what they owed or were
 * owed then and a way to settle what is left (SRS FR-02.4). Hidden when there
 * are none.
 */
export function PastApartments() {
  const userId = useCurrentUserId();
  const exits = useMyExits(userId);
  const ids = [
    ...new Set(exits.data?.flatMap((exit) => exit.balances.map((b) => b.counterpartyId)) ?? []),
  ];
  const names = useDisplayNames(ids);

  if (!exits.data || exits.data.length === 0) return null;
  const nameOf = (id: string) => names.data?.[id] ?? 'A former flatmate';

  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>Past apartments</Card.Title>
        {exits.data.map((exit, index) => {
          const money = (amountMinor: number) =>
            `${formatMinorUnits(amountMinor)} ${exit.currency}`;
          const owed = exit.balances.filter(
            (balance) => balance.payableMinor !== 0 || balance.heldMinor !== 0,
          );
          return (
            <View key={exit.id} className="gap-2">
              {index > 0 ? <Separator /> : null}
              <Typography.Paragraph weight="semibold">{exit.apartmentName}</Typography.Paragraph>
              <Typography.Paragraph type="body-xs" color="muted">
                {exit.reason === 'removed' ? 'Removed' : 'Left'} on {formatDate(exit.exitedAt)}
              </Typography.Paragraph>
              {owed.length === 0 ? (
                <Typography.Paragraph type="body-sm">
                  You were square with everyone.
                </Typography.Paragraph>
              ) : (
                owed.map((balance) => (
                  <Typography.Paragraph key={balance.counterpartyId} type="body-sm">
                    {balance.payableMinor > 0
                      ? `You owed ${nameOf(balance.counterpartyId)} ${money(balance.payableMinor)}`
                      : balance.payableMinor < 0
                        ? `${nameOf(balance.counterpartyId)} owed you ${money(-balance.payableMinor)}`
                        : `Nothing payable with ${nameOf(balance.counterpartyId)}`}
                    {balance.heldMinor !== 0
                      ? `, ${money(Math.abs(balance.heldMinor))} held by disputes`
                      : ''}
                  </Typography.Paragraph>
                ))
              )}
              {owed.length > 0 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: '/apartments/[apartmentId]/settlement',
                      params: { apartmentId: exit.apartmentId },
                    })
                  }
                >
                  See what is left to settle
                </Button>
              ) : null}
            </View>
          );
        })}
      </Card.Body>
    </Card>
  );
}
