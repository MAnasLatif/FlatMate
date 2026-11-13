import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import {
  Button,
  Card,
  Chip,
  Menu,
  PressableFeedback,
  Separator,
  Typography,
  useThemeColor,
} from 'heroui-native';
import type { ReactNode } from 'react';
import { Alert, View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { Member } from '@/features/apartments/api';
import { APARTMENT_ERROR_MESSAGES } from '@/features/apartments/errors';
import {
  useApartment,
  useApartmentId,
  useLeaveApartment,
  useMemberActions,
  useMembers,
} from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import type { PairBalance } from '@/features/expenses/api';
import { PairBalanceLine } from '@/features/expenses/components/pair-balance-line';
import { usePairBalances } from '@/features/expenses/hooks';
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
  const apartment = useApartment(apartmentId);
  const balances = usePairBalances(apartmentId);
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
  const currency = apartment.data?.currency;
  const balanceOf = (memberId: string) =>
    balances.data?.find((balance) => balance.counterpartyId === memberId);
  // The balance shows once the balances and the currency have loaded.
  const showBalances = balances.isSuccess && currency !== undefined;
  const openLedger = (memberId: string) =>
    router.push({
      pathname: '/apartments/[apartmentId]/ledger/[memberId]',
      params: { apartmentId, memberId },
    });

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
          balances.isError
            ? 'Could not load balances. Pull down to try again; the members are still shown.'
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

/** The part of a member's row that opens the pairwise ledger, when there is one to open. */
function OpensLedger({
  name,
  onPress,
  children,
}: {
  name: string;
  onPress: (() => void) | undefined;
  children: ReactNode;
}) {
  if (!onPress) return <View className="flex-1 flex-row items-center gap-3">{children}</View>;
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Balance with ${name}`}
      className="flex-1 flex-row items-center gap-3"
    >
      {children}
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
        </OpensLedger>
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
