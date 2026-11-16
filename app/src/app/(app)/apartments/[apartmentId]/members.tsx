import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import Stack from 'expo-router/stack';
import {
  Button,
  Card,
  Menu,
  PressableFeedback,
  Separator,
  Typography,
  useThemeColor,
} from 'heroui-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { StatusChip } from '@/components/status-chip';
import type { Member } from '@/features/apartments/api';
import { JoinRequests } from '@/features/apartments/components/join-requests';
import {
  AddMemberButton,
  AddMemberSheet,
} from '@/features/apartments/components/add-member-button';
import { APARTMENT_ERROR_MESSAGES } from '@/features/apartments/errors';
import {
  useApartment,
  useApartmentId,
  useMemberActions,
  useMembers,
  useRejoinInvites,
} from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import type { PairBalance } from '@/features/expenses/api';
import { PairBalanceLine } from '@/features/expenses/components/pair-balance-line';
import { usePairBalances } from '@/features/expenses/hooks';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { ProfileAvatar } from '@/features/profile/components/profile-avatar';
import { useIsOnline } from '@/lib/network';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

function nameOf(member: Member): string {
  return member.displayName ?? 'Unnamed member';
}

export default function MembersScreen() {
  const apartmentId = useApartmentId();
  const userId = useCurrentUserId();
  const members = useMembers(apartmentId);
  const apartment = useApartment(apartmentId);
  const balances = usePairBalances(apartmentId);
  const actions = useMemberActions(apartmentId);
  useMarkSeen(unreadMatches.members(apartmentId));
  const [isAddingMember, setAddingMember] = useState(false);

  if (members.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  if (members.isLoadingError) {
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
  const currentIds = new Set(current.map((member) => member.userId));
  const viewerIsAdmin = current.some(
    (member) => member.userId === userId && member.role === 'admin',
  );
  // Someone who came back is listed once, as a member; an admin may have
  // removed someone from this list, which hides them here and nowhere else.
  const former = latestFormer(
    members.data.filter(
      (member) =>
        member.leftAt !== null && member.hiddenAt === null && !currentIds.has(member.userId),
    ),
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: viewerIsAdmin
            ? () => <AddMemberButton onPress={() => setAddingMember(true)} />
            : undefined,
        }}
      />
      <MembersList
        apartmentId={apartmentId}
        userId={userId}
        members={members}
        current={current}
        former={former}
        viewerIsAdmin={viewerIsAdmin}
        actions={actions}
        balances={balances}
        currency={apartment.data?.currency}
      />
      {viewerIsAdmin ? (
        <AddMemberSheet
          apartmentId={apartmentId}
          apartmentName={apartment.data?.name ?? 'our apartment'}
          isOpen={isAddingMember}
          onOpenChange={setAddingMember}
        />
      ) : null}
    </>
  );
}

function MembersList({
  apartmentId,
  userId,
  members,
  current,
  former,
  viewerIsAdmin,
  actions,
  balances,
  currency,
}: {
  apartmentId: string;
  userId: string;
  members: ReturnType<typeof useMembers>;
  current: Member[];
  former: Member[];
  viewerIsAdmin: boolean;
  actions: ReturnType<typeof useMemberActions>;
  balances: ReturnType<typeof usePairBalances>;
  currency: string | undefined;
}) {
  const invites = useRejoinInvites(apartmentId, viewerIsAdmin && former.length > 0);
  const invited = new Set(invites.data?.map((invite) => invite.userId));
  const actionError =
    actions.setRole.error ?? actions.setCanAddExpense.error ?? actions.remove.error;
  const balanceOf = (memberId: string) =>
    balances.data?.find((balance) => balance.counterpartyId === memberId);
  // The balance shows once the balances and the currency have loaded.
  const showBalances = balances.isSuccess && currency !== undefined;
  const openLedger = (memberId: string) =>
    router.push({
      pathname: '/apartments/[apartmentId]/ledger/[memberId]',
      params: { apartmentId, memberId },
    });

  return (
    <Screen
      freshness={members}
      padTop={false}
      refreshing={members.isRefetching}
      onRefresh={() => {
        void members.refetch();
        void balances.refetch();
      }}
    >
      <FormAlert
        message={
          actionError
            ? userErrorMessage(actionError, 'Could not make that change.', APARTMENT_ERROR_MESSAGES)
            : null
        }
      />
      <FormAlert
        status="warning"
        message={
          balances.isLoadingError
            ? 'Could not load balances. Pull down to try again; the members are still shown.'
            : null
        }
      />

      {viewerIsAdmin ? <JoinRequests apartmentId={apartmentId} /> : null}

      <View className="gap-3">
        {current.map((member) => (
          <MemberRow
            key={member.membershipId}
            member={member}
            isViewer={member.userId === userId}
            viewerIsAdmin={viewerIsAdmin}
            actions={actions}
            balance={
              showBalances && member.userId !== userId
                ? { value: balanceOf(member.userId), currency }
                : undefined
            }
            onOpenLedger={member.userId === userId ? undefined : () => openLedger(member.userId)}
          />
        ))}
      </View>

      {former.length > 0 ? (
        <View className="gap-3">
          <Typography.Heading type="h6">Former members</Typography.Heading>
          {former.map((member) => (
            <Card key={member.membershipId}>
              <Card.Body className="flex-row items-center gap-3">
                <OpensLedger
                  name={nameOf(member)}
                  onPress={member.userId === userId ? undefined : () => openLedger(member.userId)}
                >
                  <ProfileAvatar
                    name={member.displayName}
                    avatarPath={member.avatarPath}
                    size="sm"
                  />
                  <View className="flex-1">
                    <Typography.Paragraph>{nameOf(member)}</Typography.Paragraph>
                    <Typography.Paragraph type="body-xs" color="muted">
                      {member.leftReason === 'removed' ? 'Removed' : 'Left'} on{' '}
                      {formatDate(member.leftAt ?? member.joinedAt)}
                    </Typography.Paragraph>
                    {showBalances && member.userId !== userId ? (
                      <PairBalanceLine balance={balanceOf(member.userId)} currency={currency} />
                    ) : null}
                    {invited.has(member.userId) ? (
                      <View className="flex-row">
                        <StatusChip size="sm" variant="secondary">
                          Invited back
                        </StatusChip>
                      </View>
                    ) : null}
                  </View>
                </OpensLedger>
              </Card.Body>
            </Card>
          ))}
        </View>
      ) : null}

      <Separator />

      <Button
        variant="danger-soft"
        onPress={() =>
          router.push({ pathname: '/apartments/[apartmentId]/leave', params: { apartmentId } })
        }
      >
        Leave apartment
      </Button>
    </Screen>
  );
}

/**
 * The part of a member's row that opens their page: the balance with them,
 * and for an admin, the actions on them in the page's top bar.
 */
function OpensLedger({
  name,
  onPress,
  children,
}: {
  name: string;
  onPress: (() => void) | undefined;
  children: ReactNode;
}) {
  const chevronColor = useThemeColor('muted');
  if (!onPress) return <View className="flex-1 flex-row items-center gap-3">{children}</View>;
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      className="flex-1 flex-row items-center gap-3"
    >
      {children}
      <Ionicons name="chevron-forward" size={20} color={chevronColor} />
    </PressableFeedback>
  );
}

type MemberRowProps = {
  member: Member;
  isViewer: boolean;
  viewerIsAdmin: boolean;
  actions: ReturnType<typeof useMemberActions>;
  /** The member's balance with the viewer, once loaded. */
  balance?: { value: PairBalance | undefined; currency: string };
  onOpenLedger?: () => void;
};

function MemberRow({
  member,
  isViewer,
  viewerIsAdmin,
  actions,
  balance,
  onOpenLedger,
}: MemberRowProps) {
  const iconColor = useThemeColor('muted');
  const name = nameOf(member);
  const isBusy =
    actions.setRole.isPending || actions.setCanAddExpense.isPending || actions.remove.isPending;
  const isOnline = useIsOnline();

  return (
    <Card>
      <Card.Body className="flex-row items-center gap-3">
        <OpensLedger name={name} onPress={onOpenLedger}>
          <ProfileAvatar name={member.displayName} avatarPath={member.avatarPath} size="md" />
          <View className="flex-1 gap-1">
            <Typography.Paragraph>
              {name}
              {isViewer ? ' (you)' : ''}
            </Typography.Paragraph>
            {balance ? (
              <PairBalanceLine balance={balance.value} currency={balance.currency} />
            ) : null}
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
          </View>
        </OpensLedger>
        {/* An admin's own settings stay here; the actions on anyone else are
            in the top bar of that person's page. */}
        {viewerIsAdmin && isViewer ? (
          <Menu>
            <Menu.Trigger
              accessibilityRole="button"
              accessibilityLabel="Your actions"
              isDisabled={isBusy || !isOnline}
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
                  <Menu.ItemTitle>Step down as admin</Menu.ItemTitle>
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
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        ) : null}
      </Card.Body>
    </Card>
  );
}

/** One row per former member: the most recent time they left. */
function latestFormer(members: Member[]): Member[] {
  const latest = new Map<string, Member>();
  for (const member of members) {
    const seen = latest.get(member.userId);
    if (!seen || (member.leftAt ?? '') > (seen.leftAt ?? '')) latest.set(member.userId, member);
  }
  return members.filter((member) => latest.get(member.userId) === member);
}
