import { router } from 'expo-router';
import { FieldError, Input, Label, TextField } from 'heroui-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { DateField } from '@/components/form/date-field';
import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { currencySymbol } from '@/features/apartments/currencies';
import { PayerFields } from '@/features/expenses/components/payer-fields';
import { SplitFields } from '@/features/expenses/components/split-fields';
import { userErrorMessage } from '@/lib/errors';
import { todayInTimeZone } from '@/lib/time';
import { randomUuid } from '@/lib/uuid';

import { newDepositDraft, validateDepositDraft } from '../draft';
import { DEPOSIT_ERROR_MESSAGES } from '../errors';
import { useRecordDeposit } from '../hooks';
import { useDepositData } from './use-deposit-data';

/**
 * Records a deposit paid to the landlord: who paid it and each member's
 * share. Anyone who paid more than their share is owed the difference.
 */
export function RecordDeposit({ apartmentId }: { apartmentId: string }) {
  const data = useDepositData(apartmentId);
  if (data.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  if (data.error || !data.apartment.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(data.error, 'Could not load the apartment.')}
          onRetry={data.retry}
        />
      </Screen>
    );
  }
  if (!data.isAdmin) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message="Only admins of this apartment can record a deposit." />
      </Screen>
    );
  }
  return (
    <DepositForm
      apartmentId={apartmentId}
      currency={data.apartment.data.currency}
      today={todayInTimeZone(data.apartment.data.timezone)}
      userId={data.userId}
      members={data.currentMembers}
    />
  );
}

function DepositForm({
  apartmentId,
  currency,
  today,
  userId,
  members,
}: {
  apartmentId: string;
  currency: string;
  today: string;
  userId: string;
  members: ReturnType<typeof useDepositData>['currentMembers'];
}) {
  const [draft, setDraft] = useState(() => newDepositDraft(userId, today));
  const [showErrors, setShowErrors] = useState(false);
  // One id per deposit being recorded, so a retried save cannot record it twice.
  const [requestId] = useState(randomUuid);
  const record = useRecordDeposit(apartmentId);
  const memberIds = useMemo(() => members.map((member) => member.userId), [members]);
  const result = useMemo(
    () => validateDepositDraft(draft, memberIds, today),
    [draft, memberIds, today],
  );
  const error = (field: keyof typeof result.errors) =>
    showErrors ? result.errors[field] : undefined;
  const update = (patch: Partial<typeof draft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const save = () => {
    setShowErrors(true);
    if (!result.value) return;
    record.mutate({ deposit: result.value, requestId }, { onSuccess: () => router.back() });
  };

  return (
    <Screen padTop={false}>
      <View className="gap-4">
        <TextField isRequired isInvalid={error('title') !== undefined}>
          <Label>Name</Label>
          <Input
            variant="secondary"
            value={draft.title}
            onChangeText={(title) => update({ title })}
            accessibilityLabel="Deposit name"
          />
          <FieldError>{error('title')}</FieldError>
        </TextField>
        <TextField isRequired isInvalid={error('amount') !== undefined}>
          <Label>Deposit ({currencySymbol(currency)})</Label>
          <Input
            variant="secondary"
            value={draft.amount}
            onChangeText={(amount) => update({ amount })}
            keyboardType="decimal-pad"
            placeholder="0.00"
            accessibilityLabel={`Deposit in ${currency}`}
          />
          <FieldError>{error('amount')}</FieldError>
        </TextField>
        <DateField
          label="Paid on"
          isRequired
          value={draft.paidOn}
          onChange={(paidOn) => update({ paidOn })}
          today={today}
          maxDate={today}
          error={error('paidOn')}
        />
        <TextField isInvalid={error('heldBy') !== undefined}>
          <Label>Paid to (optional)</Label>
          <Input
            variant="secondary"
            value={draft.heldBy}
            onChangeText={(heldBy) => update({ heldBy })}
            placeholder="The landlord, an agency…"
            maxLength={100}
            accessibilityLabel="Paid to"
          />
          <FieldError>{error('heldBy')}</FieldError>
        </TextField>
      </View>
      <PayerFields
        value={draft}
        onChange={update}
        members={members}
        currentUserId={userId}
        currency={currency}
        error={error('payers')}
      />
      <SplitFields
        value={draft}
        onChange={update}
        shares={result.shares}
        error={showErrors || draft.splitMethod !== 'equal' ? result.errors.split : undefined}
        members={members}
        currentUserId={userId}
        currency={currency}
      />
      <FormAlert
        message={
          record.error
            ? userErrorMessage(
                record.error,
                'Could not record the deposit.',
                DEPOSIT_ERROR_MESSAGES,
              )
            : showErrors && !result.value
              ? 'Check the highlighted fields.'
              : null
        }
      />
      <OnlineButton onPress={save} isDisabled={record.isPending}>
        {record.isPending ? 'Saving…' : 'Record deposit'}
      </OnlineButton>
    </Screen>
  );
}
