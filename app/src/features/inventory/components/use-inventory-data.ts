import { loadingError } from '@/components/query-states';
import { useApartment, useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { memberLabel } from '@/features/expenses/member-label';

import { useInventory } from '../hooks';

/** What every inventory screen loads: the apartment, its members and its items. */
export function useInventoryData(apartmentId: string) {
  const userId = useCurrentUserId();
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);
  const items = useInventory(apartmentId);

  const isPending = apartment.isPending || members.isPending || items.isPending;
  const error = loadingError(apartment, members, items);
  const retry = () => {
    void apartment.refetch();
    void members.refetch();
    void items.refetch();
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
    items,
    isPending,
    error,
    retry,
    nameOf,
    /** Anyone who may add expenses manages the inventory. */
    canManage: me?.canAddExpense ?? false,
    isAdmin: me?.role === 'admin',
    currentMembers: memberList.filter((member) => member.leftAt === null),
  };
}
