import { router } from 'expo-router';
import { Button, Card, Chip, Separator, Typography } from 'heroui-native';
import { Alert, View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { LoadError, LoadingRows } from '@/components/query-states';
import { userErrorMessage } from '@/lib/errors';

import type { MyAccount } from '../api';
import { useAccountMutations, useMyAccounts } from '../hooks';
import { maskIdentifier } from '../rules';

/** The user's receiving accounts, for the profile screen (SRS FR-01.3). */
export function MyAccountsSection() {
  const accounts = useMyAccounts();
  const mutations = useAccountMutations();
  const error = mutations.remove.error ?? mutations.prefer.error;

  const edit = (accountId?: string) =>
    router.push({ pathname: '/accounts/edit', params: accountId ? { accountId } : {} });
  const confirmDelete = (account: MyAccount) =>
    Alert.alert(
      `Delete ${account.provider}?`,
      'Flatmates you shared it with will no longer see it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => mutations.remove.mutate(account.id),
        },
      ],
    );

  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>Receiving accounts</Card.Title>
        <Typography.Paragraph type="body-xs" color="muted">
          Where flatmates can pay you. Each account is private until you share it with an apartment.
          FlatMate never asks for passwords, PINs or codes.
        </Typography.Paragraph>
        <FormAlert message={error ? userErrorMessage(error, 'Could not save that.') : null} />
        {accounts.isPending ? (
          <LoadingRows count={1} />
        ) : accounts.isError ? (
          <LoadError
            message={userErrorMessage(accounts.error, 'Could not load your accounts.')}
            onRetry={() => void accounts.refetch()}
          />
        ) : (
          accounts.data.map((account) => (
            <View key={account.id} className="gap-2">
              <Separator />
              <View className="flex-row items-center gap-2">
                <View className="flex-1 gap-0.5">
                  <Typography.Paragraph>{account.provider}</Typography.Paragraph>
                  <Typography.Paragraph type="body-xs" color="muted">
                    {account.accountTitle} · {maskIdentifier(account.accountIdentifier)}
                  </Typography.Paragraph>
                  <Typography.Paragraph type="body-xs" color="muted">
                    {account.sharedWith.length === 0
                      ? 'Private'
                      : `Shared with ${account.sharedWith.length} ${account.sharedWith.length === 1 ? 'apartment' : 'apartments'}`}
                  </Typography.Paragraph>
                </View>
                {account.isPreferred ? (
                  <Chip size="sm" variant="soft" color="accent">
                    Preferred
                  </Chip>
                ) : null}
              </View>
              <View className="flex-row flex-wrap gap-2">
                <Button size="sm" variant="secondary" onPress={() => edit(account.id)}>
                  Edit
                </Button>
                {account.isPreferred ? null : (
                  <Button
                    size="sm"
                    variant="ghost"
                    isDisabled={mutations.prefer.isPending}
                    onPress={() => mutations.prefer.mutate(account.id)}
                  >
                    Make preferred
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={mutations.remove.isPending}
                  onPress={() => confirmDelete(account)}
                >
                  Delete
                </Button>
              </View>
            </View>
          ))
        )}
        <Button variant="secondary" onPress={() => edit()}>
          Add account
        </Button>
      </Card.Body>
    </Card>
  );
}
