import { router } from 'expo-router';
import { Button, Card, PressableFeedback, Separator, Typography } from 'heroui-native';
import { useMemo } from 'react';
import { View } from 'react-native';

import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { StatusChip } from '@/components/status-chip';
import { useApartment } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { useRefreshMoney } from '@/features/expenses/hooks';
import { UnreadDot } from '@/features/notifications/components/unread-dot';
import { useIsUnread, useMarkSeen } from '@/features/notifications/hooks';
import { type UnreadMatch, unreadMatches } from '@/features/notifications/unread';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

import type { PreviewRow } from '../api';
import { useClosedPeriods, useSettlementPreview } from '../hooks';
import { useNameOf } from '../names';
import { describeClosingBalance, describePeriod } from '../rules';
import { formatMoney } from '@/features/apartments/currencies';

/**
 * The open period's preview for the signed-in user, and the closed periods
 * with what was carried forward (SRS FR-08.3, FR-08.4, FR-08.5).
 */
export function SettlementOverview({ apartmentId }: { apartmentId: string }) {
  const userId = useCurrentUserId();
  const apartment = useApartment(apartmentId);
  const preview = useSettlementPreview(apartmentId);
  const history = useClosedPeriods(apartmentId);
  const refreshMoney = useRefreshMoney(apartmentId);
  const closed = useMemo(() => history.data?.pages.flat() ?? [], [history.data]);
  const isUnread = useIsUnread();
  useMarkSeen(preview.data ? seenHere(apartmentId, preview.data.rows) : null);
  // Former members cannot list current members, so names may come from profiles.
  const nameOf = useNameOf(apartmentId, [
    ...(preview.data?.rows.map((row) => row.counterpartyId) ?? []),
    ...closed.flatMap((item) => item.balances.flatMap((b) => [b.memberA, b.memberB])),
  ]);

  if (apartment.isPending || preview.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  const loadError = apartment.error ?? preview.error;
  if (loadError || !apartment.data || !preview.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load the settlement.')}
          onRetry={() => {
            void apartment.refetch();
            void preview.refetch();
          }}
        />
      </Screen>
    );
  }

  const money = (amountMinor: number) => `${formatMoney(amountMinor, apartment.data.currency)}`;
  const { period, rows } = preview.data;

  return (
    <Screen
      freshness={preview}
      padTop={false}
      refreshing={preview.isRefetching}
      onRefresh={() => void refreshMoney()}
    >
      <Card>
        <Card.Body className="gap-2">
          <Typography.Paragraph type="body-xs" color="muted">
            This period
          </Typography.Paragraph>
          <Typography.Heading type="h5">{period ? describePeriod(period) : '—'}</Typography.Heading>
          <Typography.Paragraph type="body-sm" color="muted">
            Settle up with each flatmate before the period ends. Whatever is still unpaid or
            disputed then carries into the next period; nothing is cleared just because the date
            passes.
          </Typography.Paragraph>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body className="gap-3">
          <Card.Title>With each flatmate</Card.Title>
          {rows.length === 0 ? (
            <Typography.Paragraph type="body-sm" color="muted">
              You are square with everyone.
            </Typography.Paragraph>
          ) : (
            rows.map((row, index) => (
              <View key={row.counterpartyId} className="gap-3">
                {index > 0 ? <Separator /> : null}
                <PreviewLine
                  row={row}
                  name={nameOf(row.counterpartyId)}
                  unread={isUnread(unreadMatches.withMember(apartmentId, row.counterpartyId))}
                  money={money}
                  onPress={() =>
                    router.push({
                      pathname: '/apartments/[apartmentId]/settlement/[memberId]',
                      params: { apartmentId, memberId: row.counterpartyId },
                    })
                  }
                />
              </View>
            ))
          )}
        </Card.Body>
      </Card>

      <Button
        variant="secondary"
        onPress={() =>
          router.push({ pathname: '/apartments/[apartmentId]/statements', params: { apartmentId } })
        }
      >
        Statements (PDF)
      </Button>

      <Card>
        <Card.Body className="gap-3">
          <Card.Title>Past periods</Card.Title>
          {history.isPending ? (
            <LoadingRows count={1} />
          ) : history.isLoadingError ? (
            <LoadError
              message={userErrorMessage(history.error, 'Could not load past periods.')}
              onRetry={() => void history.refetch()}
            />
          ) : closed.length === 0 ? (
            <Typography.Paragraph type="body-sm" color="muted">
              No period has closed yet.
            </Typography.Paragraph>
          ) : (
            closed.map((item, index) => (
              <View key={item.id} className="gap-1">
                {index > 0 ? <Separator /> : null}
                <Typography.Paragraph weight="semibold">
                  {describePeriod(item)}
                </Typography.Paragraph>
                <Typography.Paragraph type="body-xs" color="muted">
                  Closed {formatDate(item.closedAt)}
                  {item.openDisputeCount > 0
                    ? ` with ${item.openDisputeCount} open ${item.openDisputeCount === 1 ? 'dispute' : 'disputes'} carried forward`
                    : ''}
                </Typography.Paragraph>
                {item.balances.length === 0 ? (
                  <Typography.Paragraph type="body-sm">Everyone was square.</Typography.Paragraph>
                ) : (
                  item.balances.map((balance) => (
                    <Typography.Paragraph
                      key={`${balance.memberA}-${balance.memberB}`}
                      type="body-sm"
                    >
                      {describeClosingBalance(balance, userId, nameOf, money)}
                    </Typography.Paragraph>
                  ))
                )}
              </View>
            ))
          )}
          {history.hasNextPage ? (
            <Button
              variant="ghost"
              isDisabled={history.isFetchingNextPage}
              onPress={() => void history.fetchNextPage()}
            >
              {history.isFetchingNextPage ? 'Loading…' : 'Show older periods'}
            </Button>
          ) : null}
        </Card.Body>
      </Card>
    </Screen>
  );
}

/**
 * What this screen clears when it opens: a closed period, and payments and
 * ledger entries with anyone who has no line here, whose dots would otherwise
 * lead nowhere. The rest stay marked on each person's line.
 */
function seenHere(apartmentId: string, rows: PreviewRow[]): UnreadMatch {
  const listed = new Set(rows.map((row) => row.counterpartyId));
  const inSettlement = unreadMatches.settlement(apartmentId);
  return (item) =>
    inSettlement(item) &&
    (item.recordType === 'settlement' ||
      item.counterpartyId === null ||
      !listed.has(item.counterpartyId));
}

function PreviewLine({
  row,
  name,
  unread,
  money,
  onPress,
}: {
  row: PreviewRow;
  name: string;
  unread: boolean;
  money: (amountMinor: number) => string;
  onPress: () => void;
}) {
  const net = row.owedMinor - row.oweMinor;
  const held = row.heldOweMinor + row.heldOwedMinor;
  const summary =
    net > 0
      ? `${name} owes you ${money(net)}`
      : net < 0
        ? `You owe ${name} ${money(-net)}`
        : `You and ${name} are square`;
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={
        unread
          ? 'New. Shows what is behind it and how to settle'
          : 'Shows what is behind it and how to settle'
      }
      className="gap-1"
    >
      <View className="flex-row items-center gap-2">
        {unread ? <UnreadDot /> : null}
        <Typography.Paragraph
          className={net > 0 ? 'shrink text-success' : net < 0 ? 'shrink text-danger' : 'shrink'}
          weight="semibold"
        >
          {summary}
        </Typography.Paragraph>
      </View>
      <Typography.Paragraph type="body-xs" color="muted">
        You owe {money(row.oweMinor)} · {name} owes you {money(row.owedMinor)}
      </Typography.Paragraph>
      {held !== 0 ? (
        <View className="flex-row">
          <StatusChip size="sm" variant="soft" color="danger">
            {`${money(Math.abs(held))} held by disputes`}
          </StatusChip>
        </View>
      ) : null}
    </PressableFeedback>
  );
}
