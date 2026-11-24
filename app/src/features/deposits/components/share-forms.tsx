import { router } from 'expo-router';
import { Card, Description, FieldError, Input, Label, TextField, Typography } from 'heroui-native';
import { type ReactNode, useMemo, useState } from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { currencySymbol, formatMoney } from '@/features/apartments/currencies';
import { userErrorMessage } from '@/lib/errors';
import { minorUnitsToInput, parseAmountToMinorUnits } from '@/lib/money';
import { randomUuid } from '@/lib/uuid';

import type { Deposit } from '../api';
import { checkRefund, type DeductionRow, parseDeductions, remainingAfter } from '../draft';
import { DEPOSIT_ERROR_MESSAGES } from '../errors';
import { useRefundDepositShare, useReturnDeposit, useTakeOverDepositShare } from '../hooks';
import { previewReturn, sharesNow } from '../shares';
import { DeductionFields } from './deduction-fields';
import { useDepositData } from './use-deposit-data';

type FormProps = {
  apartmentId: string;
  deposit: Deposit;
  data: ReturnType<typeof useDepositData>;
  currency: string;
};

/** Loads the deposit, checks the user is an admin, then shows the form. */
function DepositActionScreen({
  apartmentId,
  depositId,
  children,
}: {
  apartmentId: string;
  depositId: string;
  children: (props: FormProps) => ReactNode;
}) {
  const data = useDepositData(apartmentId);
  if (data.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  if (data.error || !data.apartment.data || !data.deposits.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(data.error, 'Could not load the deposit.')}
          onRetry={data.retry}
        />
      </Screen>
    );
  }
  const deposit = data.deposits.data.find((item) => item.id === depositId);
  if (!deposit) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message="This deposit is not available." />
      </Screen>
    );
  }
  if (!data.isAdmin) {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message="Only admins of this apartment can change its deposits."
        />
      </Screen>
    );
  }
  return <>{children({ apartmentId, deposit, data, currency: data.apartment.data.currency })}</>;
}

function SaveError({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <FormAlert message={error ? userErrorMessage(error, fallback, DEPOSIT_ERROR_MESSAGES) : null} />
  );
}

/** Someone takes over all or part of another person's share, and owes them for it. */
export function TakeOverShare({
  apartmentId,
  depositId,
}: {
  apartmentId: string;
  depositId: string;
}) {
  return (
    <DepositActionScreen apartmentId={apartmentId} depositId={depositId}>
      {(props) => <TakeOverForm {...props} />}
    </DepositActionScreen>
  );
}

function TakeOverForm({ apartmentId, deposit, data, currency }: FormProps) {
  const shares = sharesNow(deposit);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [problem, setProblem] = useState<string>();
  const [requestId] = useState(randomUuid);
  const takeOver = useTakeOverDepositShare(apartmentId);
  const held = shares.find((share) => share.userId === fromId)?.amountMinor ?? 0;

  const save = () => {
    const amountMinor = parseAmountToMinorUnits(amount);
    if (!fromId || !toId) return setProblem('Choose whose share it is and who takes it over.');
    if (fromId === toId) return setProblem('Choose two different people.');
    if (amountMinor === null || amountMinor === 0 || amountMinor > held) {
      return setProblem(`Enter an amount up to ${formatMoney(held, currency)}.`);
    }
    setProblem(undefined);
    takeOver.mutate(
      { depositId: deposit.id, fromId, toId, amountMinor, requestId },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen padTop={false}>
      <Description>
        Whoever takes the share over owes its holder that amount, settled like any other debt.
      </Description>
      <View className="gap-2">
        <Label>Whose share?</Label>
        <ChoiceChips
          accessibilityLabel="Whose share"
          choices={shares.map((share) => ({
            value: share.userId,
            label: `${data.nameOf(share.userId)} (${formatMoney(share.amountMinor, currency)})`,
          }))}
          selected={fromId}
          onSelect={(id) => {
            setFromId(id);
            setAmount(
              minorUnitsToInput(shares.find((share) => share.userId === id)?.amountMinor ?? 0),
            );
          }}
        />
      </View>
      <View className="gap-2">
        <Label>Who takes it over?</Label>
        <ChoiceChips
          accessibilityLabel="Who takes it over"
          choices={data.currentMembers
            .filter((member) => member.userId !== fromId)
            .map((member) => ({ value: member.userId, label: data.nameOf(member.userId) }))}
          selected={toId}
          onSelect={setToId}
        />
      </View>
      <TextField isRequired>
        <Label>Amount ({currencySymbol(currency)})</Label>
        <Input
          variant="secondary"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          accessibilityLabel={`Amount taken over in ${currency}`}
        />
      </TextField>
      <FormAlert message={problem ?? null} />
      <SaveError error={takeOver.error} fallback="Could not record the takeover." />
      <OnlineButton onPress={save} isDisabled={takeOver.isPending}>
        {takeOver.isPending ? 'Saving…' : 'Record takeover'}
      </OnlineButton>
    </Screen>
  );
}

/** The landlord refunds one person's whole share to them, less any deductions. */
export function RefundShare({
  apartmentId,
  depositId,
}: {
  apartmentId: string;
  depositId: string;
}) {
  return (
    <DepositActionScreen apartmentId={apartmentId} depositId={depositId}>
      {(props) => <RefundForm {...props} />}
    </DepositActionScreen>
  );
}

function RefundForm({ apartmentId, deposit, data, currency }: FormProps) {
  const shares = sharesNow(deposit);
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<DeductionRow[]>([]);
  const [refund, setRefund] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [requestId] = useState(randomUuid);
  const refundShare = useRefundDepositShare(apartmentId);
  const held = shares.find((share) => share.userId === userId)?.amountMinor ?? 0;
  const parsed = useMemo(() => parseDeductions(rows), [rows]);
  const checked = userId && !parsed.error ? checkRefund(held, refund, parsed.deductions) : null;

  const save = () => {
    setShowErrors(true);
    if (!userId || parsed.error || !checked || checked.refundedMinor === undefined) return;
    refundShare.mutate(
      {
        depositId: deposit.id,
        userId,
        refundedMinor: checked.refundedMinor,
        deductions: parsed.deductions,
        requestId,
      },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen padTop={false}>
      <Description>
        For someone moving out who got their share back from the landlord. Balances between
        flatmates do not change.
      </Description>
      <View className="gap-2">
        <Label>Whose share?</Label>
        <ChoiceChips
          accessibilityLabel="Whose share"
          choices={shares.map((share) => ({
            value: share.userId,
            label: `${data.nameOf(share.userId)} (${formatMoney(share.amountMinor, currency)})`,
          }))}
          selected={userId}
          onSelect={(id) => {
            setUserId(id);
            const share = shares.find((item) => item.userId === id)?.amountMinor ?? 0;
            setRefund(minorUnitsToInput(remainingAfter(share, parsed.deductions)));
          }}
        />
        {showErrors && !userId ? <FormAlert message="Choose whose share was refunded." /> : null}
      </View>
      <DeductionFields
        rows={rows}
        onChange={(next) => {
          setRows(next);
          const deductions = parseDeductions(next).deductions;
          if (userId) setRefund(minorUnitsToInput(remainingAfter(held, deductions)));
        }}
        currency={currency}
        error={showErrors ? parsed.error : undefined}
      />
      <TextField isRequired isInvalid={showErrors && checked?.error !== undefined}>
        <Label>Refunded ({currencySymbol(currency)})</Label>
        <Input
          variant="secondary"
          value={refund}
          onChangeText={setRefund}
          keyboardType="decimal-pad"
          placeholder="0.00"
          accessibilityLabel={`Refunded in ${currency}`}
        />
        <FieldError>{showErrors ? checked?.error : undefined}</FieldError>
      </TextField>
      <SaveError error={refundShare.error} fallback="Could not record the refund." />
      <OnlineButton onPress={save} isDisabled={refundShare.isPending}>
        {refundShare.isPending ? 'Saving…' : 'Record refund'}
      </OnlineButton>
    </Screen>
  );
}

/**
 * The landlord returns the rest of the deposit to one member, less any
 * deductions, which are shared by share. That member then owes each other
 * holder their part.
 */
export function ReturnDeposit({
  apartmentId,
  depositId,
}: {
  apartmentId: string;
  depositId: string;
}) {
  return (
    <DepositActionScreen apartmentId={apartmentId} depositId={depositId}>
      {(props) => <ReturnForm {...props} />}
    </DepositActionScreen>
  );
}

function ReturnForm({ apartmentId, deposit, data, currency }: FormProps) {
  const shares = sharesNow(deposit);
  const held = shares.reduce((sum, share) => sum + share.amountMinor, 0);
  const [receivedBy, setReceivedBy] = useState<string | null>(null);
  const [rows, setRows] = useState<DeductionRow[]>([]);
  const [refund, setRefund] = useState(() => minorUnitsToInput(held));
  const [showErrors, setShowErrors] = useState(false);
  const [requestId] = useState(randomUuid);
  const returnIt = useReturnDeposit(apartmentId);
  const parsed = useMemo(() => parseDeductions(rows), [rows]);
  const checked = parsed.error ? null : checkRefund(held, refund, parsed.deductions);
  const preview = parsed.error ? null : previewReturn(shares, parsed.deductions);
  const leftHolders = shares.filter(
    (share) => !data.currentMembers.some((member) => member.userId === share.userId),
  );

  const save = () => {
    setShowErrors(true);
    if (!receivedBy || parsed.error || !checked || checked.refundedMinor === undefined) return;
    returnIt.mutate(
      {
        depositId: deposit.id,
        receivedBy,
        refundedMinor: checked.refundedMinor,
        deductions: parsed.deductions,
        requestId,
      },
      { onSuccess: () => router.back() },
    );
  };

  if (leftHolders.length > 0) {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message={`${leftHolders.map((share) => data.nameOf(share.userId)).join(', ')} moved out and still ${leftHolders.length === 1 ? 'holds a share' : 'hold shares'}. Record their refund, or who took it over, first.`}
        />
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <Description>
        Deductions are shared in proportion to each share. Whoever received the money owes each
        other holder their part.
      </Description>
      <View className="gap-2">
        <Label>Who received it?</Label>
        <ChoiceChips
          accessibilityLabel="Who received it"
          choices={data.currentMembers.map((member) => ({
            value: member.userId,
            label: data.nameOf(member.userId),
          }))}
          selected={receivedBy}
          onSelect={setReceivedBy}
        />
        {showErrors && !receivedBy ? <FormAlert message="Choose who received the money." /> : null}
      </View>
      <DeductionFields
        rows={rows}
        onChange={(next) => {
          setRows(next);
          setRefund(minorUnitsToInput(remainingAfter(held, parseDeductions(next).deductions)));
        }}
        currency={currency}
        error={showErrors ? parsed.error : undefined}
      />
      <TextField isRequired isInvalid={showErrors && checked?.error !== undefined}>
        <Label>Returned ({currencySymbol(currency)})</Label>
        <Input
          variant="secondary"
          value={refund}
          onChangeText={setRefund}
          keyboardType="decimal-pad"
          placeholder="0.00"
          accessibilityLabel={`Returned in ${currency}`}
        />
        <FieldError>{showErrors ? checked?.error : undefined}</FieldError>
      </TextField>
      {preview ? (
        <Card>
          <Card.Body className="gap-2">
            <Typography.Paragraph weight="semibold">Each person gets back</Typography.Paragraph>
            {preview.map((part) => (
              <View key={part.userId} className="flex-row justify-between gap-2">
                <Typography.Paragraph type="body-sm" className="shrink">
                  {data.nameOf(part.userId)}
                </Typography.Paragraph>
                <Typography.Paragraph type="body-sm">
                  {formatMoney(part.refundMinor, currency)}
                  {part.deductedMinor > 0
                    ? ` (${formatMoney(part.deductedMinor, currency)} kept)`
                    : ''}
                </Typography.Paragraph>
              </View>
            ))}
          </Card.Body>
        </Card>
      ) : null}
      <SaveError error={returnIt.error} fallback="Could not record the return." />
      <OnlineButton onPress={save} isDisabled={returnIt.isPending}>
        {returnIt.isPending ? 'Saving…' : 'Record return'}
      </OnlineButton>
    </Screen>
  );
}
