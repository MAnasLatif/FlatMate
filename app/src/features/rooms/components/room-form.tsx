import { router } from 'expo-router';
import { Description, FieldError, Input, Label, TextField } from 'heroui-native';
import { useMemo, useState } from 'react';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { userErrorMessage } from '@/lib/errors';
import { randomUuid } from '@/lib/uuid';

import type { Room } from '../api';
import { ROOM_ERROR_MESSAGES } from '../errors';
import { useSaveRoom } from '../hooks';
import { type RoomDraft, validateRoomDraft } from '../occupancy';
import { useRoomsData } from './use-rooms-data';

/** Adds a room, or renames the one `roomId` names and changes its weight. Admins only. */
export function RoomFormScreen({ apartmentId, roomId }: { apartmentId: string; roomId?: string }) {
  const data = useRoomsData(apartmentId);
  if (data.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={2} />
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
  if (!data.isAdmin) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message="Only admins of this apartment can change rooms." />
      </Screen>
    );
  }
  const room = roomId ? data.rooms.data.rooms.find((entry) => entry.id === roomId) : undefined;
  if (roomId && !room) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message="This room no longer exists." />
      </Screen>
    );
  }
  return <RoomForm apartmentId={apartmentId} room={room} />;
}

function RoomForm({ apartmentId, room }: { apartmentId: string; room: Room | undefined }) {
  const [draft, setDraft] = useState<RoomDraft>({
    name: room?.name ?? '',
    weight: room ? String(room.weight) : '1',
  });
  const [showErrors, setShowErrors] = useState(false);
  // One id per room being added, so a retried save cannot add it twice.
  const [requestId] = useState(randomUuid);
  const save = useSaveRoom(apartmentId);
  const result = useMemo(() => validateRoomDraft(draft), [draft]);

  const submit = () => {
    setShowErrors(true);
    if (!result.value) return;
    save.mutate(
      { room: result.value, roomId: room?.id, requestId: room ? undefined : requestId },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen padTop={false}>
      <TextField isRequired isInvalid={showErrors && result.errors.name !== undefined}>
        <Label>Name</Label>
        <Input
          variant="secondary"
          value={draft.name}
          onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
          placeholder="Master bedroom, small room…"
          maxLength={60}
          accessibilityLabel="Room name"
        />
        <FieldError>{showErrors ? result.errors.name : undefined}</FieldError>
      </TextField>
      <TextField isRequired isInvalid={showErrors && result.errors.weight !== undefined}>
        <Label>Weight</Label>
        <Input
          variant="secondary"
          value={draft.weight}
          onChangeText={(weight) => setDraft((current) => ({ ...current, weight }))}
          keyboardType="number-pad"
          maxLength={3}
          accessibilityLabel="Room weight"
        />
        {showErrors && result.errors.weight ? null : (
          <Description>
            How big a part of a bill this room takes. A room of 3 pays one and a half times a room
            of 2. Changing it never changes expenses already added.
          </Description>
        )}
        <FieldError>{showErrors ? result.errors.weight : undefined}</FieldError>
      </TextField>
      <FormAlert
        message={
          save.error
            ? userErrorMessage(save.error, 'Could not save the room.', ROOM_ERROR_MESSAGES)
            : null
        }
      />
      <OnlineButton onPress={submit} isDisabled={save.isPending}>
        {save.isPending ? 'Saving…' : room ? 'Save changes' : 'Add room'}
      </OnlineButton>
    </Screen>
  );
}
