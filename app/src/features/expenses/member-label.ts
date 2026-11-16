import type { Member } from '@/features/apartments/api';

/** How a member is named in money screens: "You" for the signed-in user. */
export function memberLabel(member: Pick<Member, 'userId' | 'displayName'>, currentUserId: string) {
  if (member.userId === currentUserId) return 'You';
  return member.displayName ?? 'Unnamed member';
}
