import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addRoomOccupant,
  archiveRoom,
  endRoomOccupancy,
  fetchRooms,
  fetchRoomSplit,
  removeRoomOccupancy,
  saveRoom,
} from './api';

export const roomKeys = {
  all: (apartmentId: string) => ['apartments', apartmentId, 'rooms'] as const,
};

export function useRooms(apartmentId: string) {
  return useQuery({ queryKey: roomKeys.all(apartmentId), queryFn: () => fetchRooms(apartmentId) });
}

function useRefreshRooms(apartmentId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: roomKeys.all(apartmentId) });
}

export function useSaveRoom(apartmentId: string) {
  const refresh = useRefreshRooms(apartmentId);
  return useMutation({
    mutationFn: (input: {
      room: { name: string; weight: number };
      roomId?: string;
      requestId?: string;
    }) => saveRoom(apartmentId, input.room, { roomId: input.roomId, requestId: input.requestId }),
    onSettled: refresh,
  });
}

export function useArchiveRoom(apartmentId: string) {
  const refresh = useRefreshRooms(apartmentId);
  return useMutation({ mutationFn: archiveRoom, onSettled: refresh });
}

export function useAddRoomOccupant(apartmentId: string) {
  const refresh = useRefreshRooms(apartmentId);
  return useMutation({ mutationFn: addRoomOccupant, onSettled: refresh });
}

export function useEndRoomOccupancy(apartmentId: string) {
  const refresh = useRefreshRooms(apartmentId);
  return useMutation({ mutationFn: endRoomOccupancy, onSettled: refresh });
}

export function useRemoveRoomOccupancy(apartmentId: string) {
  const refresh = useRefreshRooms(apartmentId);
  return useMutation({ mutationFn: removeRoomOccupancy, onSettled: refresh });
}

/** Working out a split is a read, asked for on demand from the expense form. */
export function useRoomSplit(apartmentId: string) {
  return useMutation({
    mutationFn: (input: { amountMinor: number; from: string; to: string }) =>
      fetchRoomSplit(apartmentId, input.amountMinor, input.from, input.to),
  });
}
