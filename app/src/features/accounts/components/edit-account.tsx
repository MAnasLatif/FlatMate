import { router } from 'expo-router';
import {
  Button,
  Card,
  ControlField,
  FieldError,
  Input,
  Label,
  TextField,
  Typography,
} from 'heroui-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { FormAlert } from '@/components/form/form-alert';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { MyApartment } from '@/features/apartments/api';
import { useMyApartments } from '@/features/apartments/hooks';
import { userErrorMessage } from '@/lib/errors';

import type { AccountKind, MyAccount } from '../api';
import { useAccountMutations, useMyAccounts } from '../hooks';
import { type AccountDraft, validateAccountDraft } from '../rules';

/** Adding or changing a receiving account and choosing which apartments see it. */
export function EditAccount({ accountId }: { accountId: string | null }) {
  const accounts = useMyAccounts();
  const apartments = useMyApartments();

  if (accounts.isPending || apartments.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  const loadError = accounts.error ?? apartments.error;
  if (loadError || !accounts.data || !apartments.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load your accounts.')}
          onRetry={() => {
            void accounts.refetch();
            void apartments.refetch();
          }}
        />
      </Screen>
    );
  }

  const account = accountId ? accounts.data.find((item) => item.id === accountId) : undefined;
  if (accountId && !account) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message="This account no longer exists." />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }
  return <AccountForm account={account} apartments={apartments.data} />;
}

const KIND_CHOICES: { value: AccountKind; label: string }[] = [
  { value: 'bank', label: 'Bank account' },
  { value: 'wallet', label: 'Mobile wallet' },
];

function AccountForm({
  account,
  apartments,
}: {
  account: MyAccount | undefined;
  apartments: MyApartment[];
}) {
  const [draft, setDraft] = useState<AccountDraft>({
    kind: account?.kind ?? 'bank',
    provider: account?.provider ?? '',
    accountTitle: account?.accountTitle ?? '',
    accountIdentifier: account?.accountIdentifier ?? '',
  });
  const [sharedWith, setSharedWith] = useState<string[]>(account?.sharedWith ?? []);
  const [showErrors, setShowErrors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const mutations = useAccountMutations();
  const result = useMemo(() => validateAccountDraft(draft), [draft]);
  const error = mutations.save.error ?? mutations.share.error;
  const update = (patch: Partial<AccountDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const save = async () => {
    setShowErrors(true);
    if (!result.value) return;
    setIsSaving(true);
    try {
      const id = await mutations.save.mutateAsync({
        accountId: account?.id ?? null,
        account: result.value,
      });
      const before = new Set(account?.sharedWith ?? []);
      for (const { apartment } of apartments) {
        const shared = sharedWith.includes(apartment.id);
        if (shared !== before.has(apartment.id)) {
          await mutations.share.mutateAsync({ accountId: id, apartmentId: apartment.id, shared });
        }
      }
      router.back();
    } catch {
      // The failed mutation keeps its error for the message below.
    } finally {
      setIsSaving(false);
    }
  };

  const fieldError = (field: keyof AccountDraft) => (showErrors ? result.errors[field] : undefined);

  return (
    <Screen padTop={false}>
      <Typography.Paragraph type="body-sm" color="muted">
        Only the details a flatmate needs to send you money. Never enter a password, PIN or code.
      </Typography.Paragraph>
      <ChoiceChips
        accessibilityLabel="Account type"
        choices={KIND_CHOICES}
        selected={draft.kind}
        onSelect={(kind) => update({ kind })}
      />
      <TextField isRequired isInvalid={fieldError('provider') !== undefined}>
        <Label>{draft.kind === 'bank' ? 'Bank' : 'Wallet'}</Label>
        <Input
          value={draft.provider}
          onChangeText={(provider) => update({ provider })}
          placeholder={draft.kind === 'bank' ? 'Meezan Bank' : 'JazzCash'}
          accessibilityLabel={draft.kind === 'bank' ? 'Bank' : 'Wallet'}
        />
        <FieldError>{fieldError('provider')}</FieldError>
      </TextField>
      <TextField isRequired isInvalid={fieldError('accountTitle') !== undefined}>
        <Label>Name on the account</Label>
        <Input
          value={draft.accountTitle}
          onChangeText={(accountTitle) => update({ accountTitle })}
          autoComplete="name"
          accessibilityLabel="Name on the account"
        />
        <FieldError>{fieldError('accountTitle')}</FieldError>
      </TextField>
      <TextField isRequired isInvalid={fieldError('accountIdentifier') !== undefined}>
        <Label>{draft.kind === 'bank' ? 'Account number or IBAN' : 'Wallet number'}</Label>
        <Input
          value={draft.accountIdentifier}
          onChangeText={(accountIdentifier) => update({ accountIdentifier })}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel={draft.kind === 'bank' ? 'Account number or IBAN' : 'Wallet number'}
        />
        <FieldError>{fieldError('accountIdentifier')}</FieldError>
      </TextField>

      <Card>
        <Card.Body className="gap-3">
          <Card.Title>Who can see it</Card.Title>
          <Typography.Paragraph type="body-xs" color="muted">
            Current members of the apartments you choose can see and copy the full details.
          </Typography.Paragraph>
          {apartments.length === 0 ? (
            <Typography.Paragraph type="body-sm" color="muted">
              Join an apartment to share it.
            </Typography.Paragraph>
          ) : (
            apartments.map(({ apartment }) => (
              <ControlField
                key={apartment.id}
                isSelected={sharedWith.includes(apartment.id)}
                onSelectedChange={(selected) =>
                  setSharedWith((current) =>
                    selected
                      ? [...current, apartment.id]
                      : current.filter((id) => id !== apartment.id),
                  )
                }
              >
                <View className="flex-1">
                  <Label>{apartment.name}</Label>
                </View>
                <ControlField.Indicator />
              </ControlField>
            ))
          )}
        </Card.Body>
      </Card>

      <FormAlert
        message={
          error ? userErrorMessage(error, 'Could not save the account. Please try again.') : null
        }
      />
      <Button onPress={() => void save()} isDisabled={isSaving}>
        {isSaving ? 'Saving…' : 'Save account'}
      </Button>
    </Screen>
  );
}
