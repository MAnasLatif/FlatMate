import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Menu, useThemeColor } from 'heroui-native';
import { Alert } from 'react-native';

import { HEADER_ICON_SIZE } from '@/components/screen-transitions';
import { useIsOnline } from '@/lib/network';
import { userErrorMessage } from '@/lib/errors';

import type { Member } from '../api';
import { APARTMENT_ERROR_MESSAGES, REJOIN_ERROR_MESSAGES } from '../errors';
import { useFormerMemberActions, useMemberActions, useRejoinInvites } from '../hooks';

function showError(error: unknown, messages: Record<string, string>) {
  Alert.alert('Could not make that change', userErrorMessage(error, 'Try again.', messages));
}

/**
 * The admin's actions on another person, in the top bar of their page. A
 * current member can be made an admin, allowed or stopped from adding
 * expenses, or removed. A former member can be invited back or removed from
 * the list. The database checks that the viewer is an admin.
 */
export function MemberActionsMenu({
  apartmentId,
  member,
}: {
  apartmentId: string;
  member: Member;
}) {
  const iconColor = useThemeColor('foreground');
  const isOnline = useIsOnline();
  const isFormer = member.leftAt !== null;
  const actions = useMemberActions(apartmentId);
  const former = useFormerMemberActions(apartmentId);
  const invites = useRejoinInvites(apartmentId, isFormer);
  const pendingInvite = invites.data?.find((invite) => invite.userId === member.userId);
  const name = member.displayName ?? 'this member';
  const isBusy =
    actions.setRole.isPending ||
    actions.setCanAddExpense.isPending ||
    actions.remove.isPending ||
    former.inviteBack.isPending ||
    former.cancelInvite.isPending ||
    former.hide.isPending;
  const onError = (error: unknown) => showError(error, APARTMENT_ERROR_MESSAGES);
  const onRejoinError = (error: unknown) => showError(error, REJOIN_ERROR_MESSAGES);

  const confirmRemove = () =>
    Alert.alert(
      `Remove ${name}?`,
      'They will lose access to the apartment. What they owe and are owed is recorded and stays, and they can still settle it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => actions.remove.mutate(member.userId, { onError }),
        },
      ],
    );

  const confirmHide = () =>
    Alert.alert(
      `Remove ${name} from the list?`,
      'They will no longer show under Former members. Their expenses, payments and balances stay exactly as they are, and they can still ask to join again with a code.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove from list',
          style: 'destructive',
          onPress: () =>
            former.hide.mutate(member.userId, {
              onSuccess: () => router.back(),
              onError,
            }),
        },
      ],
    );

  const invite = () =>
    former.inviteBack.mutate(member.userId, {
      onSuccess: () =>
        Alert.alert(
          'Invitation sent',
          `${name} can accept it from their list of apartments. They become a member again when they do.`,
        ),
      onError: onRejoinError,
    });

  return (
    <Menu>
      <Menu.Trigger
        accessibilityRole="button"
        accessibilityLabel={`Actions for ${name}`}
        isDisabled={isBusy || !isOnline}
        hitSlop={8}
      >
        <Ionicons name="ellipsis-vertical" size={HEADER_ICON_SIZE} color={iconColor} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Overlay />
        <Menu.Content presentation="popover" width={240}>
          {isFormer ? (
            <>
              {pendingInvite ? (
                <Menu.Item
                  onPress={() =>
                    former.cancelInvite.mutate(pendingInvite.id, { onError: onRejoinError })
                  }
                >
                  <Menu.ItemTitle>Withdraw invitation</Menu.ItemTitle>
                </Menu.Item>
              ) : (
                <Menu.Item onPress={invite} isDisabled={invites.isPending}>
                  <Menu.ItemTitle>Invite back</Menu.ItemTitle>
                </Menu.Item>
              )}
              <Menu.Item variant="danger" onPress={confirmHide}>
                <Menu.ItemTitle>Remove from list</Menu.ItemTitle>
              </Menu.Item>
            </>
          ) : (
            <>
              <Menu.Item
                onPress={() =>
                  actions.setRole.mutate(
                    {
                      userId: member.userId,
                      role: member.role === 'admin' ? 'member' : 'admin',
                    },
                    { onError },
                  )
                }
              >
                <Menu.ItemTitle>
                  {member.role === 'admin' ? 'Remove admin role' : 'Make admin'}
                </Menu.ItemTitle>
              </Menu.Item>
              <Menu.Item
                onPress={() =>
                  actions.setCanAddExpense.mutate(
                    { userId: member.userId, allowed: !member.canAddExpense },
                    { onError },
                  )
                }
              >
                <Menu.ItemTitle>
                  {member.canAddExpense ? 'Stop adding expenses' : 'Allow adding expenses'}
                </Menu.ItemTitle>
              </Menu.Item>
              <Menu.Item variant="danger" onPress={confirmRemove}>
                <Menu.ItemTitle>Remove from apartment</Menu.ItemTitle>
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  );
}
