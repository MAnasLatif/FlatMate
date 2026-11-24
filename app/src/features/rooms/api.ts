import { supabase } from '@/lib/supabase';

/**
 * The flat's rooms and who lived in each when (FR-10.6). A room's weight
 * sets its part of a bill split by room. Rooms move no money: a split by
 * room is worked out by the server and posted as a split by amount.
 */
export type Room = {
  id: string;
  name: string;
  weight: number;
  /** Set once the room is no longer used; its past still counts. */
  archivedAt: string | null;
};

export type Occupancy = {
  id: string;
  roomId: string;
  userId: string;
  /** YYYY-MM-DD, both included. A null end means they still live there. */
  startsOn: string;
  endsOn: string | null;
};

export type RoomsData = { rooms: Room[]; occupancies: Occupancy[] };

/** One person's part of a bill split by room. */
export type RoomShare = {
  userId: string;
  amountMinor: number;
  /** Days they lived in a room during the period. */
  days: number;
  /** False for a former member, whose days are left out of the split. */
  included: boolean;
};

export async function fetchRooms(apartmentId: string): Promise<RoomsData> {
  const [rooms, occupancies] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, name, weight, archived_at')
      .eq('apartment_id', apartmentId)
      .order('name', { ascending: true }),
    supabase
      .from('room_occupancies')
      .select('id, room_id, user_id, starts_on, ends_on')
      .eq('apartment_id', apartmentId)
      .order('starts_on', { ascending: false }),
  ]);
  if (rooms.error) throw rooms.error;
  if (occupancies.error) throw occupancies.error;
  return {
    rooms: rooms.data.map((row) => ({
      id: row.id,
      name: row.name,
      weight: row.weight,
      archivedAt: row.archived_at,
    })),
    occupancies: occupancies.data.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      userId: row.user_id,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
    })),
  };
}

/** Adds a room (no roomId) or renames it and changes its weight. */
export async function saveRoom(
  apartmentId: string,
  input: { name: string; weight: number },
  options: { roomId?: string; requestId?: string },
): Promise<string> {
  const { data, error } = await supabase.rpc('save_room', {
    p_apartment_id: apartmentId,
    p_name: input.name,
    p_weight: input.weight,
    p_room_id: options.roomId,
    p_request_id: options.requestId,
  });
  if (error) throw error;
  return data;
}

export async function archiveRoom(roomId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_room', { p_room_id: roomId });
  if (error) throw error;
}

export async function addRoomOccupant(input: {
  roomId: string;
  userId: string;
  startsOn: string;
  endsOn: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('add_room_occupant', {
    p_room_id: input.roomId,
    p_user_id: input.userId,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn ?? undefined,
  });
  if (error) throw error;
  return data;
}

export async function endRoomOccupancy(input: {
  occupancyId: string;
  endsOn: string;
}): Promise<void> {
  const { error } = await supabase.rpc('end_room_occupancy', {
    p_occupancy_id: input.occupancyId,
    p_ends_on: input.endsOn,
  });
  if (error) throw error;
}

export async function removeRoomOccupancy(occupancyId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_room_occupancy', { p_occupancy_id: occupancyId });
  if (error) throw error;
}

/** Works out a bill for the days `from` to `to` (both included), split by room. */
export async function fetchRoomSplit(
  apartmentId: string,
  amountMinor: number,
  from: string,
  to: string,
): Promise<RoomShare[]> {
  const { data, error } = await supabase.rpc('get_room_split', {
    p_apartment_id: apartmentId,
    p_amount_minor: amountMinor,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data.map((row) => ({
    userId: row.user_id,
    amountMinor: row.amount_minor,
    days: row.days,
    included: row.included,
  }));
}
