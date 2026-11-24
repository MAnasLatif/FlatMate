import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import Stack from 'expo-router/stack';
import {
  Button,
  Card,
  PressableFeedback,
  Separator,
  Typography,
  useThemeColor,
} from 'heroui-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { ActivityLink } from '@/features/activity/components/activity-link';
import { DepositLink } from '@/features/deposits/components/deposit-link';
import { InventoryLink } from '@/features/inventory/components/inventory-link';
import { RoomsLink } from '@/features/rooms/components/rooms-link';
import { HEADER_ICON_SIZE } from '@/components/screen-transitions';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { StatusChip } from '@/components/status-chip';
import type { Member } from '@/features/apartments/api';
import { formerMembers } from '@/features/apartments/components/manage-members';
import { AddMemberButton } from '@/features/apartments/components/add-member-button';
import { useApartment, useApartmentId, useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import type { PairBalance } from '@/features/expenses/api';
import { PairBalanceLine } from '@/features/expenses/components/pair-balance-line';
import { usePairBalances } from '@/features/expenses/hooks';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { ProfileAvatar } from '@/features/profile/components/profile-avatar';
import { SettlementLink } from '@/features/settlement/components/settlement-link';
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
  useMarkSeen(unreadMatches.members(apartmentId));

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
  const viewerIsAdmin = current.some(
    (member) => member.userId === userId && member.role === 'admin',
  );
  // Someone who came back is listed once, as a member; an admin may have
  // removed someone from this list, which hides them here and nowhere else.
  const former = formerMembers(members.data);

  return (
    <>
      <Stack.Screen
        options={{
          // Admins manage members in the settings; here they can open them,
          // or add someone straight away.
          headerRight: viewerIsAdmin
            ? () => (
                <View className="flex-row items-center gap-5">
                  <ManageMembersButton apartmentId={apartmentId} />
                  <AddMemberButton
                    onPress={() =>
                      router.push({
                        pathname: '/apartments/[apartmentId]/settings',
                        params: { apartmentId, tab: 'members' },
                      })
                    }
                  />
                </View>
              )
            : undefined,
        }}
      />
      <MembersList
        apartmentId={apartmentId}
        userId={userId}
        members={members}
        current={current}
        former={former}
        balances={balances}
        currency={apartment.data?.currency}
      />
    </>
  );
}

function MembersList({
  apartmentId,
  userId,
  members,
  current,
  former,
  balances,
  currency,
}: {
  apartmentId: string;
  userId: string;
  members: ReturnType<typeof useMembers>;
  current: Member[];
  former: Member[];
  balances: ReturnType<typeof usePairBalances>;
  currency: string | undefined;
}) {
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
        status="warning"
        message={
          balances.isLoadingError
            ? 'Could not load balances. Pull down to try again; the members are still shown.'
            : null
        }
      />

      <SettlementLink apartmentId={apartmentId} />
      <DepositLink apartmentId={apartmentId} />
      <InventoryLink apartmentId={apartmentId} />
      <RoomsLink apartmentId={apartmentId} />
      <ActivityLink apartmentId={apartmentId} />

      <View className="gap-3">
        {current.map((member) => (
          <MemberRow
            key={member.membershipId}
            member={member}
            isViewer={member.userId === userId}
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
  /** The member's balance with the viewer, once loaded. */
  balance?: { value: PairBalance | undefined; currency: string };
  onOpenLedger?: () => void;
};

/** A member as everyone sees them; admins manage members in the settings. */
function MemberRow({ member, isViewer, balance, onOpenLedger }: MemberRowProps) {
  const name = nameOf(member);

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
      </Card.Body>
    </Card>
  );
}

/** For admins, in the top bar: opens the members tab of the apartment's settings. */
function ManageMembersButton({ apartmentId }: { apartmentId: string }) {
  const iconColor = useThemeColor('foreground');
  return (
    <PressableFeedback
      onPress={() =>
        router.push({
          pathname: '/apartments/[apartmentId]/settings',
          params: { apartmentId, tab: 'members' },
        })
      }
      accessibilityRole="button"
      accessibilityLabel="Manage members"
      accessibilityHint="Opens the apartment settings"
      hitSlop={8}
    >
      <Ionicons name="settings-outline" size={HEADER_ICON_SIZE} color={iconColor} />
    </PressableFeedback>
  );
}
