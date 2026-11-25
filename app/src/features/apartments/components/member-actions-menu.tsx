import Ionicons from '@expo/vector-icons/Ionicons';
import { Menu, useThemeColor } from 'heroui-native';

import { useConfirm } from '@/components/confirm-dialog';
import { useIsOnline } from '@/lib/network';
import { userErrorMessage } from '@/lib/errors';

import type { Member } from '../api';
import { APARTMENT_ERROR_MESSAGES, REJOIN_ERROR_MESSAGES } from '../errors';
import { useFormerMemberActions, useMemberActions, useRejoinInvites } from '../hooks';

/**
 * An admin's actions on one person, on their row in the apartment's settings.
 * A current member can be made an admin, allowed or stopped from adding
 * expenses, or removed. The admin's own row offers stepping down and their
 * own expense permission; they leave the apartment rather than remove
 * themselves. A former member can be invited back or removed from the list.
 * The database checks that the viewer is an admin.
 */
export function MemberActionsMenu({
  apartmentId,
  member,
  isViewer = false,
}: {
  apartmentId: string;
  member: Member;
  isViewer?: boolean;
}) {
  const iconColor = useThemeColor('muted');
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
  const { confirm, dialog } = useConfirm();
  const showError = (error: unknown, messages: Record<string, string>) =>
    confirm({
      title: 'Could not make that change',
      description: userErrorMessage(error, 'Try again.', messages),
      confirmLabel: 'OK',
      cancelLabel: null,
    });
  const onError = (error: unknown) => showError(error, APARTMENT_ERROR_MESSAGES);
  const onRejoinError = (error: unknown) => showError(error, REJOIN_ERROR_MESSAGES);

  const confirmRemove = () =>
    confirm({
      title: `Remove ${name}?`,
      description:
        'They will lose access to the apartment. What they owe and are owed is recorded and stays, and they can still settle it.',
      confirmLabel: 'Remove',
      isDestructive: true,
      onConfirm: () => actions.remove.mutate(member.userId, { onError }),
    });

  const changeRole = () =>
    actions.setRole.mutate(
      { userId: member.userId, role: member.role === 'admin' ? 'member' : 'admin' },
      { onError },
    );

  // Stepping down cannot be undone by the person who did it: only another
  // admin can make them an admin again.
  const confirmStepDown = () =>
    confirm({
      title: 'Step down as admin?',
      description:
        'You will no longer manage members, settings or repeatable expenses. Only another admin can make you an admin again.',
      confirmLabel: 'Step down',
      isDestructive: true,
      onConfirm: changeRole,
    });

  const confirmHide = () =>
    confirm({
      title: `Remove ${name} from the list?`,
      description:
        'They will no longer show under Former members. Their expenses, payments and balances stay exactly as they are, and they can still ask to join again with a code.',
      confirmLabel: 'Remove from list',
      isDestructive: true,
      onConfirm: () => former.hide.mutate(member.userId, { onError }),
    });

  const invite = () =>
    former.inviteBack.mutate(member.userId, {
      onSuccess: () =>
        confirm({
          title: 'Invitation sent',
          description: `${name} can accept it from their list of apartments. They become a member again when they do.`,
          confirmLabel: 'OK',
          cancelLabel: null,
        }),
      onError: onRejoinError,
    });

  return (
    <>
      <Menu>
        <Menu.Trigger
          accessibilityRole="button"
          accessibilityLabel={isViewer ? 'Your actions' : `Actions for ${name}`}
          isDisabled={isBusy || !isOnline}
          hitSlop={8}
        >
          <Ionicons name="ellipsis-vertical" size={22} color={iconColor} />
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
                  onPress={isViewer && member.role === 'admin' ? confirmStepDown : changeRole}
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
                {isViewer ? null : (
                  <Menu.Item variant="danger" onPress={confirmRemove}>
                    <Menu.ItemTitle>Remove from apartment</Menu.ItemTitle>
                  </Menu.Item>
                )}
              </>
            )}
          </Menu.Content>
        </Menu.Portal>
      </Menu>
      {dialog}
    </>
  );
}
