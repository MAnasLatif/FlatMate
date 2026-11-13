import * as Clipboard from 'expo-clipboard';
import { Button, Card, Chip, Separator, Typography } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { LoadError, LoadingRows } from '@/components/query-states';
import { userErrorMessage } from '@/lib/errors';

import type { ReceivingAccount } from '../api';
import { useSharedAccounts } from '../hooks';
import { maskIdentifier } from '../rules';

/**
 * The accounts a member shares with this apartment, masked until revealed,
 * with a way to copy the number (SRS FR-07.2). The transfer itself happens
 * outside FlatMate.
 */
export function SharedAccounts({
  apartmentId,
  userId,
  name,
}: {
  apartmentId: string;
  userId: string;
  name: string;
}) {
  const accounts = useSharedAccounts(apartmentId, userId);

  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>{`How to pay ${name}`}</Card.Title>
        {accounts.isPending ? (
          <LoadingRows count={1} />
        ) : accounts.isError ? (
          <LoadError
            message={userErrorMessage(accounts.error, 'Could not load the accounts.')}
            onRetry={() => void accounts.refetch()}
          />
        ) : accounts.data.length === 0 ? (
          <Typography.Paragraph type="body-sm" color="muted">
            {name} has not shared an account with this apartment. Ask them how they want to be paid.
          </Typography.Paragraph>
        ) : (
          accounts.data.map((account, index) => (
            <View key={account.id} className="gap-2">
              {index > 0 ? <Separator /> : null}
              <AccountRow account={account} />
            </View>
          ))
        )}
      </Card.Body>
    </Card>
  );
}

function AccountRow({ account }: { account: ReceivingAccount }) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(account.accountIdentifier);
    setCopied(true);
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <View className="flex-1 gap-0.5">
          <Typography.Paragraph>{account.provider}</Typography.Paragraph>
          <Typography.Paragraph type="body-xs" color="muted">
            {account.accountTitle}
          </Typography.Paragraph>
          <Typography.Paragraph type="body-sm" selectable={isRevealed}>
            {isRevealed ? account.accountIdentifier : maskIdentifier(account.accountIdentifier)}
          </Typography.Paragraph>
        </View>
        {account.isPreferred ? (
          <Chip size="sm" variant="soft" color="accent">
            Preferred
          </Chip>
        ) : null}
      </View>
      <View className="flex-row gap-2">
        <Button size="sm" variant="ghost" onPress={() => setIsRevealed((value) => !value)}>
          {isRevealed ? 'Hide number' : 'Show number'}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => void copy()}>
          {copied ? 'Copied' : 'Copy number'}
        </Button>
      </View>
    </View>
  );
}
