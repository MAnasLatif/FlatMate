import { Button, Card, Separator, Typography } from 'heroui-native';
import { type Dispatch, type SetStateAction, useState } from 'react';
import { View } from 'react-native';

import { DateField } from '@/components/form/date-field';
import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import type { Member } from '@/features/apartments/api';
import { formatMoney } from '@/features/apartments/currencies';
import type { ExpenseDraft } from '@/features/expenses/draft';
import { memberLabel } from '@/features/expenses/member-label';
import { userErrorMessage } from '@/lib/errors';
import { parseAmountToMinorUnits } from '@/lib/money';

import { ROOM_ERROR_MESSAGES } from '../errors';
import { useRooms, useRoomSplit } from '../hooks';
import { applyRoomSplit, monthPeriod } from '../occupancy';

/**
 * In the expense form, for a flat with rooms: works out a split by room for
 * a period on the server, shows it, and fills it in as a split by amount.
 */
export function RoomSplitPanel({
  apartmentId,
  draft,
  setDraft,
  members,
  currentUserId,
  currency,
  today,
}: {
  apartmentId: string;
  draft: ExpenseDraft;
  setDraft: Dispatch<SetStateAction<ExpenseDraft>>;
  members: readonly Member[];
  currentUserId: string;
  currency: string;
  today: string;
}) {
  const rooms = useRooms(apartmentId);
  const split = useRoomSplit(apartmentId);
  const [isOpen, setOpen] = useState(false);
  const [period, setPeriod] = useState(() => monthPeriod(draft.expenseDate || today));

  // Offered once the flat has rooms; a failed load just leaves it out.
  if (!rooms.data || rooms.data.rooms.length === 0) return null;

  const nameOf = (userId: string) => {
    const member = members.find((entry) => entry.userId === userId);
    return member ? memberLabel(member, currentUserId) : 'A former member';
  };
  const amountMinor = parseAmountToMinorUnits(draft.amount);
  // A split worked out for another amount no longer applies.
  const shares = split.variables?.amountMinor === amountMinor ? split.data : undefined;
  const workOut = () => {
    if (amountMinor === null || amountMinor === 0) return;
    split.mutate({ amountMinor, from: period.from, to: period.to });
  };
  const close = () => {
    setOpen(false);
    split.reset();
  };

  if (!isOpen) {
    return (
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Split by room…
      </Button>
    );
  }

  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>Split by room</Card.Title>
        <Typography.Paragraph type="body-sm" color="muted">
          Each room&apos;s part follows its weight and the days someone lived in it during the
          period, shared equally by the people in the room. It is filled in as a split by amount.
        </Typography.Paragraph>
        <Separator />
        <DateField
          label="From"
          value={period.from}
          onChange={(from) => {
            setPeriod((current) => ({ ...current, from }));
            split.reset();
          }}
          today={today}
          isRequired
        />
        <DateField
          label="To"
          value={period.to}
          onChange={(to) => {
            setPeriod((current) => ({ ...current, to }));
            split.reset();
          }}
          today={today}
          minDate={period.from || undefined}
          isRequired
        />
        <FormAlert
          message={
            amountMinor === null || amountMinor === 0
              ? 'Enter the amount first.'
              : split.error
                ? userErrorMessage(
                    split.error,
                    'Could not work out the split.',
                    ROOM_ERROR_MESSAGES,
                  )
                : null
          }
          status={amountMinor === null || amountMinor === 0 ? 'warning' : undefined}
        />
        {shares ? (
          <View className="gap-2">
            {shares.map((share) =>
              share.included ? (
                <View key={share.userId} className="flex-row justify-between gap-3">
                  <Typography.Paragraph type="body-sm" className="flex-1">
                    {nameOf(share.userId)}
                    <Typography.Paragraph type="body-sm" color="muted">
                      {`  ${share.days} ${share.days === 1 ? 'day' : 'days'}`}
                    </Typography.Paragraph>
                  </Typography.Paragraph>
                  <Typography.Paragraph type="body-sm" weight="semibold">
                    {formatMoney(share.amountMinor, currency)}
                  </Typography.Paragraph>
                </View>
              ) : (
                <Typography.Paragraph key={share.userId} type="body-xs" color="muted">
                  {nameOf(share.userId)} lived in a room for {share.days}{' '}
                  {share.days === 1 ? 'day' : 'days'} of this period but has left, so cannot share a
                  new expense. Their room counts as empty on those days.
                </Typography.Paragraph>
              ),
            )}
          </View>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          {shares ? (
            <Button
              size="sm"
              onPress={() => {
                setDraft((current) =>
                  applyRoomSplit(
                    current,
                    shares,
                    members.map((member) => member.userId),
                    period,
                  ),
                );
                close();
              }}
            >
              Use this split
            </Button>
          ) : (
            <OnlineButton
              size="sm"
              isDisabled={split.isPending || amountMinor === null || amountMinor === 0}
              onPress={workOut}
            >
              {split.isPending ? 'Working it out…' : 'Work it out'}
            </OnlineButton>
          )}
          <Button size="sm" variant="ghost" onPress={close}>
            Cancel
          </Button>
        </View>
      </Card.Body>
    </Card>
  );
}
