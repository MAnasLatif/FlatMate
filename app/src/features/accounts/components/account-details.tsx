import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import Stack from 'expo-router/stack';
import { Button, Chip, Separator, Typography } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, loadingError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { useMyApartments } from '@/features/apartments/hooks';
import { userErrorMessage } from '@/lib/errors';

import type { MyAccount } from '../api';
import { useAccountMutations, useMyAccounts } from '../hooks';
import { DeleteAccountSheet } from './delete-account-sheet';

/** One of the user's bank or wallet accounts, with everything they can do to it. */
export function AccountDetails({ accountId }: { accountId: string }) {
  const accounts = useMyAccounts();
  const apartments = useMyApartments();

  if (accounts.isPending || apartments.isPending) {
    return (
      <Screen freshness={accounts} padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  const loadError = loadingError(accounts, apartments);
  if (loadError || !accounts.data || !apartments.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load this account.')}
          onRetry={() => {
            void accounts.refetch();
            void apartments.refetch();
          }}
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

  const sharedNames = apartments.data
    .filter(({ apartment }) => account.sharedWith.includes(apartment.id))
    .map(({ apartment }) => apartment.name);

  return <Details account={account} sharedNames={sharedNames} freshness={accounts} />;
}

function Details({
  account,
  sharedNames,
  freshness,
}: {
  account: MyAccount;
  sharedNames: string[];
  freshness: Parameters<typeof Screen>[0]['freshness'];
}) {
  const { prefer } = useAccountMutations();
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isBank = account.kind === 'bank';

  const copy = async () => {
    await Clipboard.setStringAsync(account.accountIdentifier);
    setCopied(true);
  };

  return (
    <Screen freshness={freshness} padTop={false}>
      <Stack.Screen options={{ title: account.provider }} />

      <View className="flex-row items-center gap-2">
        <Typography.Paragraph color="muted" className="flex-1">
          {isBank ? 'Bank account' : 'Mobile wallet'}
        </Typography.Paragraph>
        {account.isPreferred ? (
          <Chip size="sm" variant="soft" color="accent">
            Preferred
          </Chip>
        ) : null}
      </View>

      <Detail label={isBank ? 'Bank' : 'Wallet'} value={account.provider} />
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
      <Detail
        label="Who can see it"
        value={
          sharedNames.length === 0
            ? 'Private. No apartment can see it.'
            : `Members of ${sharedNames.join(', ')}`
        }
      />

      <Separator />

      <FormAlert
        message={prefer.error ? userErrorMessage(prefer.error, 'Could not save that.') : null}
      />
      <View className="gap-3">
        <Button
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/accounts/edit', params: { accountId: account.id } })
          }
        >
          Edit
        </Button>
        {account.isPreferred ? null : (
          <OnlineButton
            variant="secondary"
            onPress={() => prefer.mutate(account.id)}
            isDisabled={prefer.isPending}
          >
            {prefer.isPending ? 'Saving…' : 'Make preferred'}
          </OnlineButton>
        )}
        <Button variant="danger-soft" onPress={() => setIsDeleting(true)}>
          Delete account
        </Button>
      </View>

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
}: {
  label: string;
  value: string;
  selectable?: boolean;
}) {
  return (
    <View className="gap-1">
      <Typography.Paragraph type="body-sm" color="muted">
        {label}
      </Typography.Paragraph>
      <Typography.Paragraph selectable={selectable}>{value}</Typography.Paragraph>
    </View>
  );
}
