import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Button, Card, Chip, Menu, Separator, Typography, useThemeColor } from 'heroui-native';
import { Alert, View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { Member } from '@/features/apartments/api';
import { APARTMENT_ERROR_MESSAGES } from '@/features/apartments/errors';
import {
  useApartmentId,
  useLeaveApartment,
  useMemberActions,
  useMembers,
} from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { ProfileAvatar } from '@/features/profile/components/profile-avatar';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

function nameOf(member: Member): string {
  return member.displayName ?? 'Unnamed member';
}

export default function MembersScreen() {
  const apartmentId = useApartmentId();
  const userId = useCurrentUserId();
  const members = useMembers(apartmentId);
  const actions = useMemberActions(apartmentId);
  const leave = useLeaveApartment(apartmentId);

  if (members.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  if (members.isError) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(members.error, 'Could not load the members.')}
          onRetry={() => void members.refetch()}
        />
      </Screen>
    );
  }

  const current = members.data.filter((member) => member.leftAt === null);
  const former = members.data.filter((member) => member.leftAt !== null);
  const viewerIsAdmin = current.some(
    (member) => member.userId === userId && member.role === 'admin',
  );

  const actionError =
    actions.setRole.error ?? actions.setCanAddExpense.error ?? actions.remove.error;

  const confirmLeave = () => {
    Alert.alert(
      'Leave this apartment?',
      'You will lose access to its current expenses. Your past records and any money you owe or are owed stay as they are.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => leave.mutate(undefined, { onSuccess: () => router.dismissTo('/') }),
        },
      ],
    );
  };

  return (
    <Screen
      padTop={false}
      refreshing={members.isRefetching}
      onRefresh={() => void members.refetch()}
    >
      <FormAlert
        message={
          actionError
            ? userErrorMessage(actionError, 'Could not make that change.', APARTMENT_ERROR_MESSAGES)
            : null
        }
      />

      <View className="gap-3">
        {current.map((member) => (
          <MemberRow
            key={member.membershipId}
            member={member}
            isViewer={member.userId === userId}
            viewerIsAdmin={viewerIsAdmin}
            actions={actions}
          />
        ))}
      </View>

      {former.length > 0 ? (
        <View className="gap-3">
          <Typography.Heading type="h6">Former members</Typography.Heading>
          {former.map((member) => (
            <Card key={member.membershipId}>
              <Card.Body className="flex-row items-center gap-3">
                <ProfileAvatar name={member.displayName} avatarPath={member.avatarPath} size="sm" />
                <View className="flex-1">
                  <Typography.Paragraph>{nameOf(member)}</Typography.Paragraph>
                  <Typography.Paragraph type="body-xs" color="muted">
                    {member.leftReason === 'removed' ? 'Removed' : 'Left'} on{' '}
                    {formatDate(member.leftAt ?? member.joinedAt)}
                  </Typography.Paragraph>
                </View>
              </Card.Body>
            </Card>
          ))}
        </View>
      ) : null}

      <Separator />

      <View className="gap-3">
        <FormAlert
          message={
            leave.error
              ? userErrorMessage(
                  leave.error,
                  'Could not leave the apartment.',
                  APARTMENT_ERROR_MESSAGES,
                )
              : null
          }
        />
        <Button variant="danger-soft" onPress={confirmLeave} isDisabled={leave.isPending}>
          {leave.isPending ? 'Leaving…' : 'Leave apartment'}
        </Button>
      </View>
    </Screen>
  );
}

type MemberRowProps = {
  member: Member;
  isViewer: boolean;
  viewerIsAdmin: boolean;
  actions: ReturnType<typeof useMemberActions>;
};

function MemberRow({ member, isViewer, viewerIsAdmin, actions }: MemberRowProps) {
  const iconColor = useThemeColor('muted');
  const name = nameOf(member);
  const isBusy =
    actions.setRole.isPending || actions.setCanAddExpense.isPending || actions.remove.isPending;

  const confirmRemove = () => {
    Alert.alert(
      `Remove ${name}?`,
      'They will lose access to the apartment. Their past records and any money they owe or are owed stay as they are.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => actions.remove.mutate(member.userId),
        },
      ],
    );
  };

  return (
    <Card>
      <Card.Body className="flex-row items-center gap-3">
        <ProfileAvatar name={member.displayName} avatarPath={member.avatarPath} size="md" />
        <View className="flex-1 gap-1">
          <Typography.Paragraph>
            {name}
            {isViewer ? ' (you)' : ''}
          </Typography.Paragraph>
          <View className="flex-row flex-wrap gap-2">
            {member.role === 'admin' ? (
              <Chip size="sm" variant="secondary">
                Admin
              </Chip>
            ) : null}
            {member.canAddExpense ? null : (
              <Chip size="sm" variant="tertiary">
                Cannot add expenses
              </Chip>
            )}
          </View>
        </View>
        {viewerIsAdmin ? (
          <Menu>
            <Menu.Trigger
              accessibilityRole="button"
              accessibilityLabel={`Actions for ${name}`}
              isDisabled={isBusy}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={iconColor} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Overlay />
              <Menu.Content presentation="popover" width={240}>
                <Menu.Item
                  onPress={() =>
                    actions.setRole.mutate({
                      userId: member.userId,
                      role: member.role === 'admin' ? 'member' : 'admin',
                    })
                  }
                >
                  <Menu.ItemTitle>
                    {member.role === 'admin'
                      ? isViewer
                        ? 'Step down as admin'
                        : 'Remove admin role'
                      : 'Make admin'}
                  </Menu.ItemTitle>
                </Menu.Item>
                <Menu.Item
                  onPress={() =>
                    actions.setCanAddExpense.mutate({
                      userId: member.userId,
                      allowed: !member.canAddExpense,
                    })
                  }
                >
                  <Menu.ItemTitle>
                    {member.canAddExpense ? 'Stop adding expenses' : 'Allow adding expenses'}
                  </Menu.ItemTitle>
                </Menu.Item>
                {isViewer ? null : (
                  <Menu.Item variant="danger" onPress={confirmRemove}>
                    <Menu.ItemTitle>Remove from apartment</Menu.ItemTitle>
                  </Menu.Item>
                )}
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        ) : null}
      </Card.Body>
    </Card>
  );
}
