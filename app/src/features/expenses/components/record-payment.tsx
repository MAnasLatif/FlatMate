import { router } from 'expo-router';
import { Button, Card, Typography } from 'heroui-native';
import { useMemo, useState } from 'react';

import { FormAlert } from '@/components/form/form-alert';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { Member } from '@/features/apartments/api';
import { useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { userErrorMessage } from '@/lib/errors';
import { formatMinorUnits } from '@/lib/money';

import type { ExpenseDetail } from '../api';
import { type PayerInput, validatePayers } from '../draft';
import { EXPENSE_ERROR_MESSAGES } from '../errors';
import { useExpenseDetail, useRecordBillPayment } from '../hooks';
import { memberLabel } from '../member-label';
import { matchDebts } from '../split';
import { PayerFields } from './payer-fields';

/** Records who paid a bill that was added as unpaid. */
export function RecordPayment({
  apartmentId,
  expenseId,
}: {
  apartmentId: string;
  expenseId: string;
}) {
  const detail = useExpenseDetail(apartmentId, expenseId);
  const members = useMembers(apartmentId);

  if (detail.isPending || members.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  const loadError = detail.error ?? members.error;
  if (loadError || !members.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load this bill.')}
          onRetry={() => {
            void detail.refetch();
            void members.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!detail.data || detail.data.paidStatus !== 'unpaid' || detail.data.status !== 'provisional') {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message={
            detail.data?.status === 'disputed'
              ? EXPENSE_ERROR_MESSAGES.expense_disputed
              : 'This bill has already been paid or is no longer available.'
          }
        />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  return (
    <RecordPaymentForm
      apartmentId={apartmentId}
      expense={detail.data}
      members={members.data.filter((member) => member.leftAt === null)}
      allMembers={members.data}
    />
  );
}

function RecordPaymentForm({
  apartmentId,
  expense,
  members,
  allMembers,
}: {
  apartmentId: string;
  expense: ExpenseDetail;
  /** Current members, who can be recorded as payers. */
  members: Member[];
  /** Everyone, including former members who are in the split. */
  allMembers: Member[];
}) {
  const userId = useCurrentUserId();
  const [input, setInput] = useState<PayerInput>({
    payerMode: 'single',
    payerId: userId,
    payerAmounts: {},
  });
  const [showErrors, setShowErrors] = useState(false);
  const record = useRecordBillPayment(apartmentId, expense.id);

  const memberIds = useMemo(() => members.map((member) => member.userId), [members]);
  const checked = useMemo(
    () => validatePayers(input, memberIds, expense.amountMinor),
    [input, memberIds, expense.amountMinor],
  );
  const debts = checked.error ? null : matchDebts(checked.payers, expense.splits);
  const money = (amountMinor: number) => `${formatMinorUnits(amountMinor)} ${expense.currency}`;
  const nameOf = (id: string) => {
    const member = allMembers.find((item) => item.userId === id);
    return member ? memberLabel(member, userId) : 'A former member';
  };

  const save = () => {
    setShowErrors(true);
    if (checked.error) return;
    record.mutate(checked.payers, { onSuccess: () => router.back() });
  };

  return (
    <Screen padTop={false}>
      <Typography.Paragraph type="body-sm" color="muted">
        {expense.title}, {money(expense.amountMinor)}. Record who paid it. Each person&apos;s share
        then becomes a debt to whoever paid, and flatmates can object as with any expense.
      </Typography.Paragraph>
      <Card>
        <Card.Body>
          <PayerFields
            value={input}
            onChange={(patch) => setInput((current) => ({ ...current, ...patch }))}
            members={members}
            currentUserId={userId}
            currency={expense.currency}
            error={showErrors || input.payerMode === 'multiple' ? checked.error : undefined}
          />
        </Card.Body>
      </Card>
      {debts ? (
        <Card>
          <Card.Body className="gap-2">
            <Card.Title>Preview</Card.Title>
            {debts.length === 0 ? (
              <Typography.Paragraph type="body-sm">
                Everyone paid their own share. Nobody will owe anything.
              </Typography.Paragraph>
            ) : (
              debts.map((debt) => (
                <Typography.Paragraph key={`${debt.debtorId}-${debt.creditorId}`} type="body-sm">
                  {nameOf(debt.debtorId)} will owe{' '}
                  {debt.creditorId === userId ? 'you' : nameOf(debt.creditorId)}{' '}
                  {money(debt.amountMinor)}
                </Typography.Paragraph>
              ))
            )}
          </Card.Body>
        </Card>
      ) : null}
      <FormAlert
        message={
          record.error
            ? userErrorMessage(
                record.error,
                'Could not record the payment. Please try again.',
                EXPENSE_ERROR_MESSAGES,
              )
            : null
        }
      />
      <Button onPress={save} isDisabled={record.isPending}>
        {record.isPending ? 'Saving…' : 'Record payment'}
      </Button>
    </Screen>
  );
}
