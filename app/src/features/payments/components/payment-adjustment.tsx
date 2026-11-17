import { FieldError, Input, Label, TextArea, TextField, Typography } from 'heroui-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { currencySymbol, formatMoney } from '@/features/apartments/currencies';
import { userErrorMessage } from '@/lib/errors';
import { minorUnitsToInput, parseAmountToMinorUnits } from '@/lib/money';
import { randomUuid } from '@/lib/uuid';

import type { Payment, PaymentObjection } from '../api';
import { ADJUSTMENT_ERROR_MESSAGES } from '../errors';
import { usePaymentMutations } from '../hooks';

const REASON_MAX_LENGTH = 500;

/** Checks the adjustment form. An adjustment is never more than the payment it corrects. */
export function checkAdjustment(
  amountText: string,
  reasonText: string,
  paymentMinor: number,
): { amountMinor?: number; reason?: string; amountError?: string; reasonError?: string } {
  const amountMinor = parseAmountToMinorUnits(amountText);
  const reason = reasonText.trim();
  const result: ReturnType<typeof checkAdjustment> = {};
  if (amountMinor === null || amountMinor <= 0) {
    result.amountError = 'Enter the amount that did not arrive, such as 1500 or 1500.50.';
  } else if (amountMinor > paymentMinor) {
    result.amountError = 'It cannot be more than the payment.';
  } else {
    result.amountMinor = amountMinor;
  }
  if (reason === '') {
    result.reasonError = 'Say what the adjustment is for, for example that nothing arrived.';
  } else if (reason.length > REASON_MAX_LENGTH) {
    result.reasonError = 'Keep the reason under 500 characters.';
  } else {
    result.reason = reason;
  }
  return result;
}

/**
 * Settles a late objection to a final payment. The payment stays confirmed,
 * as closed figures never move; instead the payer owes the recipient the
 * amount again, as a new linked entry (decisions 0005 and 0006).
 */
export function PaymentAdjustment({
  apartmentId,
  payment,
  objection,
  payerName,
  recipientName,
  viewerIsPayer,
}: {
  apartmentId: string;
  payment: Payment;
  objection: PaymentObjection;
  payerName: string;
  recipientName: string;
  viewerIsPayer: boolean;
}) {
  const mutations = usePaymentMutations(apartmentId);
  const [amount, setAmount] = useState(() => minorUnitsToInput(payment.amountMinor));
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  // One id per form, so a retry after a lost answer never adjusts twice.
  const [requestId] = useState(randomUuid);
  const checked = checkAdjustment(amount, reason, payment.amountMinor);
  const isBusy = mutations.adjust.isPending;

  const submit = () => {
    setShowErrors(true);
    const { amountMinor, reason: text } = checked;
    if (amountMinor === undefined || text === undefined) return;
    const owes = viewerIsPayer ? 'You will owe' : `${payerName} will owe`;
    Alert.alert(
      'Record this adjustment?',
      `${owes} ${recipientName} ${formatMoney(amountMinor, payment.currency)} again. The payment stays confirmed, and this cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record',
          onPress: () =>
            mutations.adjust.mutate({
              apartmentId,
              payerId: payment.payerId,
              recipientId: payment.recipientId,
              amountMinor,
              reason: text,
              objectionId: objection.id,
              requestId,
            }),
        },
      ],
    );
  };

  return (
    <View className="gap-3">
      <Typography.Paragraph type="body-sm">
        {recipientName} objected after the deadline, so the payment stayed confirmed.{' '}
        {viewerIsPayer
          ? 'If the money really did not arrive, record that you owe it again.'
          : `If ${payerName} does not settle it, you can decide as an admin who is part of neither side.`}
      </Typography.Paragraph>
      <FormAlert
        message={
          mutations.adjust.error
            ? userErrorMessage(
                mutations.adjust.error,
                'Could not record the adjustment. Please try again.',
                ADJUSTMENT_ERROR_MESSAGES,
              )
            : null
        }
      />
      <TextField isInvalid={showErrors && checked.amountError !== undefined}>
        <Label>Amount that did not arrive ({currencySymbol(payment.currency)})</Label>
        <Input
          variant="secondary"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          editable={!isBusy}
          accessibilityLabel={`Amount that did not arrive, in ${payment.currency}`}
        />
        <FieldError>{showErrors ? checked.amountError : undefined}</FieldError>
      </TextField>
      <TextField isInvalid={showErrors && checked.reasonError !== undefined}>
        <Label>What is it for?</Label>
        <TextArea
          variant="secondary"
          value={reason}
          onChangeText={setReason}
          editable={!isBusy}
          accessibilityLabel="What the adjustment is for"
        />
        <FieldError>{showErrors ? checked.reasonError : undefined}</FieldError>
      </TextField>
      <OnlineButton variant="secondary" onPress={submit} isDisabled={isBusy}>
        {isBusy ? 'Recording…' : 'Record adjustment'}
      </OnlineButton>
    </View>
  );
}
