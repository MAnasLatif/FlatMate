import { loadingError } from '@/components/query-states';
import { useApartment, useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { memberLabel } from '@/features/expenses/member-label';

import { useDeposits } from '../hooks';

/** What every deposit screen loads: the apartment, its members and its deposits. */
export function useDepositData(apartmentId: string) {
  const userId = useCurrentUserId();
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);
  const deposits = useDeposits(apartmentId);

  const isPending = apartment.isPending || members.isPending || deposits.isPending;
  const error = loadingError(apartment, members, deposits);
  const retry = () => {
    void apartment.refetch();
    void members.refetch();
    void deposits.refetch();
  };
  const memberList = members.data ?? [];
  const nameOf = (id: string): string => {
    const member = memberList.find((item) => item.userId === id);
    return member ? memberLabel(member, userId) : id === userId ? 'You' : 'A former member';
  };
  const isAdmin = memberList.some(
    (member) => member.userId === userId && member.leftAt === null && member.role === 'admin',
  );
  const currentMembers = memberList.filter((member) => member.leftAt === null);

  return {
    userId,
    apartment,
    deposits,
    isPending,
    error,
    retry,
    nameOf,
    isAdmin,
    currentMembers,
  };
}
