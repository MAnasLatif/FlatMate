import { Typography } from 'heroui-native';

import { formatMinorUnits } from '@/lib/money';

import type { PairBalance } from '../api';
import { pairPosition } from '../balances';

/**
 * A member's balance with the signed-in user, for the members directory: the
 * net, and both directions when money goes each way (SRS FR-06.2).
 */
export function PairBalanceLine({
  balance,
  currency,
}: {
  balance: PairBalance | undefined;
  currency: string;
}) {
  const position = pairPosition(balance);
  const money = (amountMinor: number) => `${formatMinorUnits(amountMinor)} ${currency}`;
  const net =
    position.netMinor > 0
      ? `Owes you ${money(position.netMinor)}`
      : position.netMinor < 0
        ? `You owe ${money(-position.netMinor)}`
        : 'Square';
  const details = [
    position.oweMinor > 0 && position.owedMinor > 0
      ? `you owe ${money(position.oweMinor)}, they owe ${money(position.owedMinor)}`
      : null,
    position.isProvisional ? 'provisional' : null,
    position.heldOweMinor > 0 || position.heldOwedMinor > 0 ? 'some held by a dispute' : null,
  ].filter(Boolean);

  return (
    <>
      <Typography.Paragraph
        type="body-sm"
        className={
          position.netMinor > 0 ? 'text-success' : position.netMinor < 0 ? 'text-danger' : undefined
        }
        color={position.netMinor === 0 ? 'muted' : 'default'}
      >
        {net}
      </Typography.Paragraph>
      {details.length > 0 ? (
        <Typography.Paragraph type="body-xs" color="muted">
          {details.join(' · ')}
        </Typography.Paragraph>
      ) : null}
    </>
  );
}
