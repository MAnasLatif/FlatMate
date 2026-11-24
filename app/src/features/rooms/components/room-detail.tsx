import { router } from 'expo-router';
import { Button, Card, Separator, Typography } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { useConfirm } from '@/components/confirm-dialog';
import { DateField } from '@/components/form/date-field';
import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { memberLabel } from '@/features/expenses/member-label';
import { userErrorMessage } from '@/lib/errors';

import type { Occupancy, Room } from '../api';
import { ROOM_ERROR_MESSAGES } from '../errors';
import {
  useAddRoomOccupant,
  useArchiveRoom,
  useEndRoomOccupancy,
  useRemoveRoomOccupancy,
} from '../hooks';
import { stayLabel } from '../occupancy';
import { useRoomsData } from './use-rooms-data';

/** One room: its weight and everyone who lived in it. Admins record moves here. */
export function RoomDetail({ apartmentId, roomId }: { apartmentId: string; roomId: string }) {
  const data = useRoomsData(apartmentId);
  const archive = useArchiveRoom(apartmentId);
  const remove = useRemoveRoomOccupancy(apartmentId);
  const { confirm, dialog } = useConfirm();
  const [isAdding, setAdding] = useState(false);

  if (data.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  if (data.error || !data.rooms.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(data.error, 'Could not load this room.')}
          onRetry={data.retry}
        />
      </Screen>
    );
  }
  const room = data.rooms.data.rooms.find((entry) => entry.id === roomId);
  if (!room) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message="This room no longer exists." />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }
  const stays = data.rooms.data.occupancies.filter((stay) => stay.roomId === roomId);
  const canChange = data.isAdmin && room.archivedAt === null;
  const actionError = archive.error ?? remove.error;

  return (
    <Screen
      freshness={data.rooms}
      padTop={false}
      refreshing={data.rooms.isRefetching}
      onRefresh={data.retry}
    >
      <Card>
        <Card.Body className="gap-1">
          <Typography.Heading type="h5" accessibilityRole="header">
            {room.name}
          </Typography.Heading>
          <Typography.Paragraph type="body-sm" color="muted">
            {room.archivedAt ? 'No longer used. ' : ''}Weight {room.weight}
          </Typography.Paragraph>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body className="gap-3">
          <Card.Title>Who lived here</Card.Title>
          <Separator />
          {stays.length === 0 ? (
            <Typography.Paragraph type="body-sm" color="muted">
              Nobody yet.
            </Typography.Paragraph>
          ) : (
            stays.map((stay) => (
              <StayRow
                key={stay.id}
                apartmentId={apartmentId}
                stay={stay}
                name={data.nameOf(stay.userId)}
                today={data.today}
                canChange={data.isAdmin}
                onRemove={() =>
                  confirm({
                    title: 'Remove this stay?',
                    description:
                      'Use this for a stay entered by mistake. Expenses already split by room keep their amounts.',
                    confirmLabel: 'Remove',
                    isDestructive: true,
                    onConfirm: () => remove.mutate(stay.id),
                  })
                }
              />
            ))
          )}
          {canChange && !isAdding ? (
            <Button size="sm" variant="secondary" onPress={() => setAdding(true)}>
              Add someone
            </Button>
          ) : null}
          {isAdding ? (
            <AddOccupant
              apartmentId={apartmentId}
              room={room}
              members={data.currentMembers.map((member) => ({
                value: member.userId,
                label: memberLabel(member, data.userId),
              }))}
              today={data.today}
              onDone={() => setAdding(false)}
            />
          ) : null}
        </Card.Body>
      </Card>

      <FormAlert
        message={
          actionError
            ? userErrorMessage(actionError, 'Could not change the room.', ROOM_ERROR_MESSAGES)
            : null
        }
      />
      {canChange ? (
        <>
          <Button
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/apartments/[apartmentId]/rooms/[roomId]/edit',
                params: { apartmentId, roomId },
              })
            }
          >
            Edit room
          </Button>
          <OnlineButton
            variant="danger-soft"
            isDisabled={archive.isPending}
            onPress={() =>
              confirm({
                title: `Stop using "${room.name}"?`,
                description:
                  'Nobody can move into it again. Its past stays still count when a bill covers those days.',
                confirmLabel: 'Stop using',
                isDestructive: true,
                onConfirm: () => archive.mutate(roomId),
              })
            }
          >
            Stop using this room
          </OnlineButton>
        </>
      ) : null}
      {dialog}
    </Screen>
  );
}

function StayRow({
  apartmentId,
  stay,
  name,
  today,
  canChange,
  onRemove,
}: {
  apartmentId: string;
  stay: Occupancy;
  name: string;
  today: string;
  canChange: boolean;
  onRemove: () => void;
}) {
  const end = useEndRoomOccupancy(apartmentId);
  const [isEnding, setEnding] = useState(false);
  const [endsOn, setEndsOn] = useState(today);

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1">
          <Typography.Paragraph type="body-sm">{name}</Typography.Paragraph>
          <Typography.Paragraph type="body-xs" color="muted">
            {stayLabel(stay)}
          </Typography.Paragraph>
        </View>
        {canChange ? (
          <View className="flex-row gap-1">
            {stay.endsOn === null && !isEnding ? (
              <Button size="sm" variant="ghost" onPress={() => setEnding(true)}>
                Moved out
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onPress={onRemove}
              accessibilityLabel={`Remove ${name}'s stay`}
            >
              Remove
            </Button>
          </View>
        ) : null}
      </View>
      {isEnding ? (
        <View className="gap-2">
          <DateField
            label="Last day in the room"
            value={endsOn}
            onChange={setEndsOn}
            today={today}
            minDate={stay.startsOn}
            isRequired
          />
          <FormAlert
            message={
              end.error
                ? userErrorMessage(end.error, 'Could not save this.', ROOM_ERROR_MESSAGES)
                : null
            }
          />
          <View className="flex-row gap-2">
            <OnlineButton
              size="sm"
              isDisabled={end.isPending || endsOn === ''}
              onPress={() =>
                end.mutate({ occupancyId: stay.id, endsOn }, { onSuccess: () => setEnding(false) })
              }
            >
              {end.isPending ? 'Saving…' : 'Save'}
            </OnlineButton>
            <Button size="sm" variant="ghost" onPress={() => setEnding(false)}>
              Cancel
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function AddOccupant({
  apartmentId,
  room,
  members,
  today,
  onDone,
}: {
  apartmentId: string;
  room: Room;
  members: { value: string; label: string }[];
  today: string;
  onDone: () => void;
}) {
  const add = useAddRoomOccupant(apartmentId);
  const [userId, setUserId] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState('');

  return (
    <View className="gap-3">
      <ChoiceChips
        choices={members}
        selected={userId}
        onSelect={setUserId}
        accessibilityLabel="Who lives here"
      />
      <DateField
        label="First day in the room"
        value={startsOn}
        onChange={setStartsOn}
        today={today}
        isRequired
      />
      <DateField
        label="Last day (optional)"
        value={endsOn}
        onChange={setEndsOn}
        today={today}
        minDate={startsOn || undefined}
        isClearable
      />
      <FormAlert
        message={
          add.error ? userErrorMessage(add.error, 'Could not add them.', ROOM_ERROR_MESSAGES) : null
        }
      />
      <View className="flex-row gap-2">
        <OnlineButton
          size="sm"
          isDisabled={add.isPending || userId === null || startsOn === ''}
          onPress={() => {
            if (!userId) return;
            add.mutate(
              { roomId: room.id, userId, startsOn, endsOn: endsOn || null },
              { onSuccess: onDone },
            );
          }}
        >
          {add.isPending ? 'Saving…' : 'Save'}
        </OnlineButton>
        <Button size="sm" variant="ghost" onPress={onDone}>
          Cancel
        </Button>
      </View>
    </View>
  );
}
