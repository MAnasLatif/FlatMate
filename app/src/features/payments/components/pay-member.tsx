import { router } from 'expo-router';
import {
  Button,
  Card,
  FieldError,
  Input,
  Label,
  Separator,
  TextField,
  Typography,
} from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { FormAlert } from '@/components/form/form-alert';
import { PhotoPicker } from '@/components/photo-picker';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { Apartment } from '@/features/apartments/api';
import { useApartment, useMembers } from '@/features/apartments/hooks';
import { pairPosition } from '@/features/expenses/balances';
import { isValidDate } from '@/features/expenses/draft';
import { usePairBalances } from '@/features/expenses/hooks';
import { userErrorMessage } from '@/lib/errors';
import { formatMinorUnits } from '@/lib/money';
import type { PickedImage } from '@/lib/private-images';
import { addDays, todayInTimeZone } from '@/lib/time';
import { randomUuid } from '@/lib/uuid';

import { PAYMENT_ERROR_MESSAGES, proofUploadErrorMessage } from '../errors';
import { usePaymentMutations } from '../hooks';
import { type PaymentPlan, type PayMode, planPayment } from '../rules';

const REFERENCE_MAX_LENGTH = 100;

/** Recording that the user paid one member, from their ledger or an expense (SRS FR-07.1, FR-07.3). */
export function PayMember({
  apartmentId,
  memberId,
  expenseId,
}: {
  apartmentId: string;
  memberId: string;
  expenseId: string | null;
}) {
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);
  const balances = usePairBalances(apartmentId);

  if (apartment.isPending || members.isPending || balances.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  const loadError = apartment.error ?? members.error ?? balances.error;
  if (loadError || !apartment.data || !members.data || !balances.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load what you owe.')}
          onRetry={() => {
            void apartment.refetch();
            void members.refetch();
            void balances.refetch();
          }}
        />
      </Screen>
    );
  }

  const name =
    members.data.find((member) => member.userId === memberId)?.displayName ?? 'This member';
  const position = pairPosition(
    balances.data.find((balance) => balance.counterpartyId === memberId),
  );

  return (
    <PayForm
      apartment={apartment.data}
      memberId={memberId}
      name={name}
      owe={position.oweMinor}
      owed={position.owedMinor}
      expenseId={expenseId}
    />
  );
}

function PayForm({
  apartment,
  memberId,
  name,
  owe,
  owed,
  expenseId,
}: {
  apartment: Apartment;
  memberId: string;
  name: string;
  owe: number;
  owed: number;
  expenseId: string | null;
}) {
  const today = todayInTimeZone(apartment.timezone);
  const money = (amountMinor: number) => `${formatMinorUnits(amountMinor)} ${apartment.currency}`;
  const [mode, setMode] = useState<PayMode>('gross');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<PickedImage | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  // Fixed ids, so retrying after a failure never nets off or records twice.
  const [offsetRequestId] = useState(randomUuid);
  const [paymentRequestId] = useState(randomUuid);
  // Once saving starts, the plan is kept: balances refresh after each step.
  const [submittedPlan, setSubmittedPlan] = useState<PaymentPlan | null>(null);
  const [offsetDone, setOffsetDone] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const mutations = usePaymentMutations(apartment.id);

  const checked = planPayment(owe, owed, mode, amount);
  const plan = submittedPlan ?? checked.plan;
  const dateError = !isValidDate(paidOn)
    ? 'Enter the date as YYYY-MM-DD.'
    : paidOn > today
      ? 'The date cannot be in the future.'
      : undefined;
  const referenceError =
    reference.trim().length > REFERENCE_MAX_LENGTH ? 'Use at most 100 characters.' : undefined;
  const failure = mutations.netOff.error ?? mutations.record.error ?? null;

  const save = async () => {
    setShowErrors(true);
    if (!plan || (!submittedPlan && (dateError || referenceError || checked.error))) return;
    setSubmittedPlan(plan);
    setIsSaving(true);
    try {
      if (plan.offsetMinor > 0 && !offsetDone) {
        await mutations.netOff.mutateAsync({
          counterpartyId: memberId,
          amountMinor: plan.offsetMinor,
          requestId: offsetRequestId,
        });
        setOffsetDone(true);
      }
      let recorded = paymentId;
      if (plan.payMinor > 0 && !recorded) {
        recorded = await mutations.record.mutateAsync({
          apartmentId: apartment.id,
          recipientId: memberId,
          amountMinor: plan.payMinor,
          // Today means now; an earlier day is recorded at midday on that day.
          paidAt: paidOn === today ? null : new Date(`${paidOn}T12:00:00`).toISOString(),
          reference: reference.trim() || null,
          expenseId,
          requestId: paymentRequestId,
        });
        setPaymentId(recorded);
      }
      if (recorded && proof) {
        await mutations.addProof.mutateAsync({ paymentId: recorded, image: proof });
      }
      if (recorded) {
        router.replace({
          pathname: '/apartments/[apartmentId]/payments/[paymentId]',
          params: { apartmentId: apartment.id, paymentId: recorded },
        });
      } else {
        router.back();
      }
    } catch {
      // Each mutation keeps its error for the message below; saving again resumes where it stopped.
    } finally {
      setIsSaving(false);
    }
  };

  if (owe <= 0) {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message={`You do not owe ${name} anything right now${owed > 0 ? `; ${name} owes you ${money(owed)}` : ''}.`}
        />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <Typography.Paragraph type="body-sm" color="muted">
        FlatMate does not move money. Pay {name} with your bank or wallet, then record it here.{' '}
        {name} can object within the apartment&apos;s window if it does not arrive.
      </Typography.Paragraph>

      <Card>
        <Card.Body className="gap-2">
          <AmountLine label={`You owe ${name}`} amount={money(owe)} />
          <AmountLine label={`${name} owes you`} amount={money(owed)} />
          {owed > 0 ? (
            <>
              <Separator />
              <ChoiceChips
                accessibilityLabel="How to pay"
                choices={[
                  { value: 'gross' as const, label: `Pay what I owe` },
                  { value: 'net' as const, label: 'Net off first' },
                ]}
                selected={mode}
                onSelect={(value) => {
                  if (!submittedPlan) setMode(value);
                }}
              />
              {mode === 'net' && checked.plan ? (
                <Typography.Paragraph type="body-xs" color="muted">
                  {money(checked.plan.offsetMinor)} is netted off both ways, so the net between you
                  does not change.{' '}
                  {checked.plan.payMinor > 0
                    ? `Then you pay ${money(owe - checked.plan.offsetMinor)} or less.`
                    : 'Nothing is left for you to pay.'}
                </Typography.Paragraph>
              ) : null}
            </>
          ) : null}
        </Card.Body>
      </Card>

      {checked.plan === undefined || checked.plan.payMinor > 0 || amount !== '' ? (
        <View className="gap-4">
          <TextField isInvalid={showErrors && checked.error !== undefined}>
            <Label>Amount you paid ({apartment.currency})</Label>
            <Input
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={formatMinorUnits(owe - (mode === 'net' ? Math.min(owe, owed) : 0))}
              editable={!submittedPlan}
              accessibilityLabel={`Amount you paid, in ${apartment.currency}`}
            />
            <FieldError>{showErrors ? checked.error : undefined}</FieldError>
          </TextField>
          <TextField isInvalid={showErrors && dateError !== undefined}>
            <Label>Paid on</Label>
            <Input
              value={paidOn}
              onChangeText={setPaidOn}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              editable={!submittedPlan}
              accessibilityLabel="Paid on, as year-month-day"
            />
            <FieldError>{showErrors ? dateError : undefined}</FieldError>
          </TextField>
          <ChoiceChips
            accessibilityLabel="Quick date"
            choices={[
              { value: today, label: 'Today' },
              { value: addDays(today, -1), label: 'Yesterday' },
            ]}
            selected={paidOn}
            onSelect={(value) => {
              if (!submittedPlan) setPaidOn(value);
            }}
          />
          <TextField isInvalid={referenceError !== undefined}>
            <Label>Transaction reference (optional)</Label>
            <Input
              value={reference}
              onChangeText={setReference}
              placeholder="From your bank or wallet app"
              editable={!submittedPlan}
              accessibilityLabel="Transaction reference"
            />
            <FieldError>{referenceError}</FieldError>
          </TextField>
          <PhotoPicker
            title="Proof"
            description="Optional. A screenshot of the transfer. It cannot be removed once saved, and it is your claim, not a bank confirmation."
            attachLabel="Attach proof"
            image={proof}
            onChange={setProof}
            isDisabled={isSaving}
          />
        </View>
      ) : null}

      <FormAlert
        message={
          failure
            ? userErrorMessage(
                failure,
                'Could not record the payment. Please try again.',
                PAYMENT_ERROR_MESSAGES,
              )
            : mutations.addProof.error
              ? `The payment was recorded, but the proof was not attached. ${proofUploadErrorMessage(mutations.addProof.error)}`
              : null
        }
      />
      {mutations.addProof.error && paymentId ? (
        <Button
          variant="ghost"
          onPress={() =>
            router.replace({
              pathname: '/apartments/[apartmentId]/payments/[paymentId]',
              params: { apartmentId: apartment.id, paymentId },
            })
          }
        >
          Continue without proof
        </Button>
      ) : null}
      <Button onPress={() => void save()} isDisabled={isSaving}>
        {isSaving
          ? 'Saving…'
          : plan && plan.payMinor === 0
            ? 'Net off'
            : paymentId
              ? 'Attach proof again'
              : 'Record payment'}
      </Button>
    </Screen>
  );
}

function AmountLine({ label, amount }: { label: string; amount: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3" accessible>
      <Typography.Paragraph type="body-sm" className="flex-1">
        {label}
      </Typography.Paragraph>
      <Typography.Paragraph type="body-sm" weight="semibold">
        {amount}
      </Typography.Paragraph>
    </View>
  );
}
