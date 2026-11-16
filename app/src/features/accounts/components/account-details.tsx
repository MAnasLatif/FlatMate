import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import Stack from 'expo-router/stack';
import { Button, Chip, Separator, Typography, useThemeColor } from 'heroui-native';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { userErrorMessage } from '@/lib/errors';

import type { MyAccount } from '../api';
import { useAccountMutations, useMyAccounts } from '../hooks';
import { DeleteAccountSheet } from './delete-account-sheet';

/**
 * One of the user's bank or wallet accounts, with Edit and Delete in the
 * header and Make preferred beside its type. `children` is shown under the
 * details; the route passes the payments made into the account.
 */
export function AccountDetails({
  accountId,
  children,
}: {
  accountId: string;
  children?: ReactNode;
}) {
  const accounts = useMyAccounts();

  if (accounts.isPending) {
    return (
      <Screen freshness={accounts} padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  if (accounts.isLoadingError) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(accounts.error, 'Could not load this account.')}
          onRetry={() => void accounts.refetch()}
        />
      </Screen>
    );
  }

  const account = accounts.data.find((item) => item.id === accountId);
  if (!account) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message="This account no longer exists." />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  return (
    <Details account={account} freshness={accounts}>
      {children}
    </Details>
  );
}

function Details({
  account,
  freshness,
  children,
}: {
  account: MyAccount;
  freshness: Parameters<typeof Screen>[0]['freshness'];
  children?: ReactNode;
}) {
  const { prefer } = useAccountMutations();
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [accent, danger] = useThemeColor(['accent', 'danger']);
  const isBank = account.kind === 'bank';

  const copy = async () => {
    await Clipboard.setStringAsync(account.accountIdentifier);
    setCopied(true);
  };

  return (
    <Screen freshness={freshness} padTop={false}>
      <Stack.Screen
        options={{
          title: account.provider,
          headerRight: () => (
            <View className="flex-row">
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() =>
                  router.push({ pathname: '/accounts/edit', params: { accountId: account.id } })
                }
                accessibilityLabel="Edit account"
              >
                <Ionicons name="create-outline" size={22} color={accent} />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() => setIsDeleting(true)}
                accessibilityLabel="Delete account"
              >
                <Ionicons name="trash-outline" size={22} color={danger} />
              </Button>
            </View>
          ),
        }}
      />

      <Detail
        label={isBank ? 'Bank' : 'Wallet'}
        value={account.provider}
        end={
          account.isPreferred ? (
            <Chip size="sm" variant="soft" color="accent">
              Preferred
            </Chip>
          ) : (
            <OnlineButton
              size="sm"
              variant="secondary"
              isDisabled={prefer.isPending}
              onPress={() => prefer.mutate(account.id)}
            >
              {prefer.isPending ? 'Saving…' : 'Make preferred'}
            </OnlineButton>
          )
        }
      />
      <FormAlert
        message={prefer.error ? userErrorMessage(prefer.error, 'Could not save that.') : null}
      />
      <Detail label="Name on the account" value={account.accountTitle} />
      <View className="gap-2">
        <Detail
          label={isBank ? 'Account number or IBAN' : 'Wallet number'}
          value={account.accountIdentifier}
          selectable
        />
        <View className="flex-row">
          <Button size="sm" variant="secondary" onPress={() => void copy()}>
            {copied ? 'Copied' : 'Copy number'}
          </Button>
        </View>
      </View>

      {children ? (
        <>
          <Separator />
          {children}
        </>
      ) : null}

      <DeleteAccountSheet
        account={isDeleting ? account : null}
        onClose={() => setIsDeleting(false)}
        onDeleted={() => router.back()}
      />
    </Screen>
  );
}

function Detail({
  label,
  value,
  selectable,
  end,
}: {
  label: string;
  value: string;
  selectable?: boolean;
  /** Shown at the end of the row, such as the Preferred tag. */
  end?: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1 gap-1">
        <Typography.Paragraph type="body-sm" color="muted">
          {label}
        </Typography.Paragraph>
        <Typography.Paragraph selectable={selectable}>{value}</Typography.Paragraph>
      </View>
      {end}
    </View>
  );
}
