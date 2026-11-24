import { router } from 'expo-router';
import { Card, PressableFeedback, Typography } from 'heroui-native';
import { View } from 'react-native';

import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { StatusChip } from '@/components/status-chip';
import { userErrorMessage } from '@/lib/errors';

import type { Room } from '../api';
import { isLivingOn } from '../occupancy';
import { useRoomsData } from './use-rooms-data';

/**
 * The flat's rooms, each with its weight and who lives in it now (FR-10.6).
 * Every member sees them; admins add and change them.
 */
export function RoomList({ apartmentId }: { apartmentId: string }) {
  const data = useRoomsData(apartmentId);

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
          message={userErrorMessage(data.error, 'Could not load the rooms.')}
          onRetry={data.retry}
        />
      </Screen>
    );
  }
  const { rooms, occupancies } = data.rooms.data;
  // Rooms in use first; archived ones after, for their history.
  const ordered = [...rooms].sort(
    (a, b) => Number(a.archivedAt !== null) - Number(b.archivedAt !== null),
  );
  const occupantsOf = (room: Room) =>
    occupancies
      .filter((stay) => stay.roomId === room.id && isLivingOn(stay, data.today))
      .map((stay) => data.nameOf(stay.userId));

  return (
    <Screen
      freshness={data.rooms}
      padTop={false}
      refreshing={data.rooms.isRefetching}
      onRefresh={data.retry}
    >
      <Typography.Paragraph type="body-sm" color="muted">
        A bill can be split by room: each room&apos;s part follows its weight and the days someone
        lived in it, shared equally by the people in the room.
      </Typography.Paragraph>
      {rooms.length === 0 ? (
        <Typography.Paragraph color="muted" className="py-10 text-center">
          No rooms yet.
        </Typography.Paragraph>
      ) : null}
      {ordered.map((room) => {
        const occupants = occupantsOf(room);
        const who = occupants.length > 0 ? occupants.join(', ') : 'Nobody lives here now';
        return (
          <PressableFeedback
            key={room.id}
            onPress={() =>
              router.push({
                pathname: '/apartments/[apartmentId]/rooms/[roomId]',
                params: { apartmentId, roomId: room.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`${room.name}, weight ${room.weight}, ${room.archivedAt ? 'no longer used' : who}`}
            className="rounded-3xl"
          >
            <Card>
              <Card.Body className="gap-2">
                <View className="flex-row items-center justify-between gap-2">
                  <Typography.Paragraph weight="semibold" numberOfLines={1} className="shrink">
                    {room.name}
                  </Typography.Paragraph>
                  {room.archivedAt ? (
                    <StatusChip size="sm" variant="soft">
                      No longer used
                    </StatusChip>
                  ) : (
                    <StatusChip size="sm" variant="soft" color="accent">
                      Weight {room.weight}
                    </StatusChip>
                  )}
                </View>
                {room.archivedAt ? null : (
                  <Typography.Paragraph type="body-sm" color="muted">
                    {who}
                  </Typography.Paragraph>
                )}
              </Card.Body>
            </Card>
          </PressableFeedback>
        );
      })}
      {data.isAdmin ? (
        <OnlineButton
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/rooms/new',
              params: { apartmentId },
            })
          }
        >
          Add a room
        </OnlineButton>
      ) : null}
    </Screen>
  );
}
