import { Card, Typography } from 'heroui-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { LoadError, LoadingRows } from '@/components/query-states';
import { StatusChip } from '@/components/status-chip';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { ProfileAvatar } from '@/features/profile/components/profile-avatar';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

import type { Member } from '../api';
import { useMembers, useRejoinInvites } from '../hooks';
import { MemberActionsMenu } from './member-actions-menu';

function nameOf(member: Member): string {
  return member.displayName ?? 'Unnamed member';
}

/** One row per former member: the most recent time they left. */
export function latestFormer(members: Member[]): Member[] {
  const latest = new Map<string, Member>();
  for (const member of members) {
    const seen = latest.get(member.userId);
    if (!seen || (member.leftAt ?? '') > (seen.leftAt ?? '')) latest.set(member.userId, member);
  }
  return members.filter((member) => latest.get(member.userId) === member);
}

/** Former members not hidden and not back as members, once each. */
export function formerMembers(members: Member[]): Member[] {
  const currentIds = new Set(
    members.filter((member) => member.leftAt === null).map((member) => member.userId),
  );
  return latestFormer(
    members.filter(
      (member) =>
        member.leftAt !== null && member.hiddenAt === null && !currentIds.has(member.userId),
    ),
  );
}

/**
 * The apartment's members as an admin manages them, in the settings: each
 * with a menu of what the admin can change. Everyone else sees the members,
 * without these actions, on the members screen.
 */
export function ManageMembers({ apartmentId }: { apartmentId: string }) {
  const userId = useCurrentUserId();
  const members = useMembers(apartmentId);
  const former = members.data ? formerMembers(members.data) : [];
  const invites = useRejoinInvites(apartmentId, former.length > 0);
  const invited = new Set(invites.data?.map((invite) => invite.userId));

  if (members.isPending) return <LoadingRows count={3} />;
  if (members.isLoadingError) {
    return (
      <LoadError
        message={userErrorMessage(members.error, 'Could not load the members.')}
        onRetry={() => void members.refetch()}
      />
    );
  }

  const current = members.data.filter((member) => member.leftAt === null);

  return (
    <View className="gap-3">
      {current.map((member) => (
        <MemberCard
          key={member.membershipId}
          apartmentId={apartmentId}
          member={member}
          isViewer={member.userId === userId}
        >
          <View className="flex-row flex-wrap gap-2">
            {member.role === 'admin' ? (
              <StatusChip size="sm" variant="secondary">
                Admin
              </StatusChip>
            ) : null}
            {member.canAddExpense ? null : (
              <StatusChip size="sm" variant="tertiary">
                Cannot add expenses
              </StatusChip>
            )}
          </View>
        </MemberCard>
      ))}

      {former.length > 0 ? (
        <>
          <Typography.Heading type="h6" className="mt-2">
            Former members
          </Typography.Heading>
          {former.map((member) => (
            <MemberCard
              key={member.membershipId}
              apartmentId={apartmentId}
              member={member}
              isViewer={false}
            >
              <Typography.Paragraph type="body-xs" color="muted">
                {member.leftReason === 'removed' ? 'Removed' : 'Left'} on{' '}
                {formatDate(member.leftAt ?? member.joinedAt)}
              </Typography.Paragraph>
              {invited.has(member.userId) ? (
                <View className="flex-row">
                  <StatusChip size="sm" variant="secondary">
                    Invited back
                  </StatusChip>
                </View>
              ) : null}
            </MemberCard>
          ))}
        </>
      ) : null}
    </View>
  );
}

function MemberCard({
  apartmentId,
  member,
  isViewer,
  children,
}: {
  apartmentId: string;
  member: Member;
  isViewer: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <Card.Body className="flex-row items-center gap-3">
        <ProfileAvatar name={member.displayName} avatarPath={member.avatarPath} size="md" />
        <View className="flex-1 gap-1">
          <Typography.Paragraph numberOfLines={1}>
            {nameOf(member)}
            {isViewer ? ' (you)' : ''}
          </Typography.Paragraph>
          {children}
        </View>
        <MemberActionsMenu apartmentId={apartmentId} member={member} isViewer={isViewer} />
      </Card.Body>
    </Card>
  );
}
