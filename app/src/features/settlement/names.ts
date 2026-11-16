import { useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { memberLabel } from '@/features/expenses/member-label';
import { useDisplayNames } from '@/features/profile/hooks';

/**
 * Names people in an apartment from its member list, or, for people the
 * user cannot see there (such as after the user left), from their profiles.
 */
export function useNameOf(apartmentId: string, userIds: string[]) {
  const userId = useCurrentUserId();
  const members = useMembers(apartmentId);
  const missing = userIds.filter(
    (id) => id !== userId && !members.data?.some((member) => member.userId === id),
  );
  const profiles = useDisplayNames(members.isPending ? [] : [...new Set(missing)]);

  return (id: string): string => {
    const member = members.data?.find((item) => item.userId === id);
    if (member) return memberLabel(member, userId);
    if (id === userId) return 'You';
    return profiles.data?.[id] ?? 'A former member';
  };
}
