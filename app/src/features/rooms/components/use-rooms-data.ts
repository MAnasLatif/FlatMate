import { loadingError } from '@/components/query-states';
import { useApartment, useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { memberLabel } from '@/features/expenses/member-label';
import { todayInTimeZone } from '@/lib/time';

import { useRooms } from '../hooks';

/** What every rooms screen loads: the apartment, its members and its rooms. */
export function useRoomsData(apartmentId: string) {
  const userId = useCurrentUserId();
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);
  const rooms = useRooms(apartmentId);

  const isPending = apartment.isPending || members.isPending || rooms.isPending;
  const error = loadingError(apartment, members, rooms);
  const retry = () => {
    void apartment.refetch();
    void members.refetch();
    void rooms.refetch();
  };
  const memberList = members.data ?? [];
  const nameOf = (id: string): string => {
    const member = memberList.find((entry) => entry.userId === id);
    return member ? memberLabel(member, userId) : id === userId ? 'You' : 'A former member';
  };
  const me = memberList.find((member) => member.userId === userId && member.leftAt === null);

  return {
    userId,
    apartment,
    rooms,
    isPending,
    error,
    retry,
    nameOf,
    isAdmin: me?.role === 'admin',
    currentMembers: memberList.filter((member) => member.leftAt === null),
    today: apartment.data ? todayInTimeZone(apartment.data.timezone) : '',
  };
}
