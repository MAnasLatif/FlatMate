import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Button, PressableFeedback, Separator, Typography, useThemeColor } from 'heroui-native';
import { useRef, useState } from 'react';
import ReanimatedSwipeable, {
  type SwipeableMethods,
  SwipeDirection,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { View } from 'react-native';

import { LoadError, LoadingRows } from '@/components/query-states';
import { StatusChip } from '@/components/status-chip';
import { userErrorMessage } from '@/lib/errors';

import type { MyAccount } from '../api';
import { useMyAccounts } from '../hooks';
import { DeleteAccountSheet } from './delete-account-sheet';

/**
 * The user's bank and wallet accounts, for the profile screen (SRS FR-01.3).
 * The list only shows them: tapping one opens its details and every option, and
 * swiping a row reveals Edit (swipe right) and Delete (swipe left).
 */
export function MyAccountsSection() {
  const accounts = useMyAccounts();
  const [deleting, setDeleting] = useState<MyAccount | null>(null);

  return (
    <View className="gap-3">
      <Typography.Heading type="h6">Bank & wallet accounts</Typography.Heading>
      <Typography.Paragraph type="body-xs" color="muted">
        Where flatmates can pay you. Each account is private until you share it with an apartment.
        FlatMate never asks for passwords, PINs or codes.
      </Typography.Paragraph>
      {accounts.isPending ? (
        <LoadingRows count={1} />
      ) : accounts.isLoadingError ? (
        <LoadError
          message={userErrorMessage(accounts.error, 'Could not load your accounts.')}
          onRetry={() => void accounts.refetch()}
        />
      ) : (
        // Rows sit directly between dividers, with no gap, so a swipe action
        // behind a row is exactly as tall as the row.
        <View>
          {accounts.data.map((account) => (
            <View key={account.id}>
              <Separator />
              <AccountRow account={account} onDelete={() => setDeleting(account)} />
            </View>
          ))}
          {accounts.data.length > 0 ? <Separator /> : null}
        </View>
      )}
      <Button variant="secondary" onPress={() => editAccount()}>
        {accounts.data && accounts.data.length > 0
          ? 'Add another bank or wallet'
          : 'Add bank or wallet'}
      </Button>
      <DeleteAccountSheet account={deleting} onClose={() => setDeleting(null)} />
    </View>
  );
}

/** The add or edit form; with no id it adds a new account. */
function editAccount(accountId?: string) {
  router.push({ pathname: '/accounts/edit', params: accountId ? { accountId } : {} });
}

function AccountRow({ account, onDelete }: { account: MyAccount; onDelete: () => void }) {
  const swipeable = useRef<SwipeableMethods>(null);
  const [accent, accentForeground, dangerForeground] = useThemeColor([
    'accent',
    'accent-foreground',
    'danger-foreground',
  ]);
  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={1.5}
      leftThreshold={SWIPE_ACTION_WIDTH * 0.6}
      rightThreshold={SWIPE_ACTION_WIDTH * 0.6}
      // A swipe past the threshold is the action itself: right edits, left
      // asks to delete. The row springs back as the action starts.
      onSwipeableOpen={(direction) => {
        swipeable.current?.close();
        if (direction === SwipeDirection.RIGHT) editAccount(account.id);
        else onDelete();
      }}
      renderLeftActions={() => (
        <SwipeAction
          label="Edit"
          icon="create-outline"
          className="bg-accent"
          color={accentForeground}
        />
      )}
      renderRightActions={() => (
        <SwipeAction
          label="Delete"
          icon="trash-outline"
          className="bg-danger"
          color={dangerForeground}
        />
      )}
    >
      <PressableFeedback
        onPress={() =>
          router.push({ pathname: '/accounts/[accountId]', params: { accountId: account.id } })
        }
        accessibilityRole="button"
        accessibilityLabel={`${account.provider}, ${account.accountTitle}, ${account.accountIdentifier}${account.isPreferred ? ', preferred' : ''}`}
        accessibilityHint="Opens the account's details"
        // No shrink on press: a smaller row would uncover the swipe actions
        // behind it. A ripple shows the press instead.
        animation={false}
        className="bg-background flex-row items-center gap-2 overflow-hidden py-3"
      >
        <PressableFeedback.Ripple />
        <View className="flex-1 gap-0.5">
          <Typography.Paragraph>{account.provider}</Typography.Paragraph>
          <Typography.Paragraph type="body-xs" color="muted">
            {account.accountTitle}
          </Typography.Paragraph>
          {/* The owner's own list shows the whole number; flatmates see it masked. */}
          <Typography.Paragraph type="body-sm">{account.accountIdentifier}</Typography.Paragraph>
        </View>
        {account.isPreferred ? (
          <StatusChip size="sm" variant="soft" color="accent">
            Preferred
          </StatusChip>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={accent} />
      </PressableFeedback>
    </ReanimatedSwipeable>
  );
}

const SWIPE_ACTION_WIDTH = 112;

/** What a swipe will do, shown behind the row as it slides. */
function SwipeAction({
  label,
  icon,
  className,
  color,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  className: string;
  color: string;
}) {
  return (
    <View
      className={`flex-row items-center justify-center gap-2 ${className}`}
      style={{ width: SWIPE_ACTION_WIDTH }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Ionicons name={icon} size={18} color={color} />
      <Typography.Paragraph style={{ color }} className="font-semibold">
        {label}
      </Typography.Paragraph>
    </View>
  );
}
