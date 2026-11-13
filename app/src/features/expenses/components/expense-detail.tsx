import { router } from 'expo-router';
import { Button, Card, Separator, Typography } from 'heroui-native';
import type { ReactNode } from 'react';
import { Alert, View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { Member } from '@/features/apartments/api';
import { useApartment, useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { userErrorMessage } from '@/lib/errors';
import { formatMinorUnits } from '@/lib/money';
import { formatDate } from '@/lib/time';

import type { ExpenseDetail } from '../api';
import { canEditExpense, describeHistoryEvent, describeStatus, historyReason } from '../detail';
import { EXPENSE_ERROR_MESSAGES } from '../errors';
import { useExpenseDetail, useVoidExpense } from '../hooks';
import { memberLabel } from '../member-label';
import { matchDebts, type SplitMethod } from '../split';
import { ExpenseReceipts } from './expense-receipts';
import { ExpenseStatusChips } from './expense-status';

const SPLIT_METHOD_TITLES: Record<SplitMethod, string> = {
  equal: 'Split equally',
  percentage: 'Split by percentage',
  fixed: 'Split by amount',
};

/**
 * Everything about one expense and what the viewer can do with it (SRS
 * FR-03.6). `children` are sections other features add, such as disputes,
 * shown after the actions.
 */
export function ExpenseDetailView({
  apartmentId,
  expenseId,
  children,
}: {
  apartmentId: string;
  expenseId: string;
  children?: ReactNode;
}) {
  const detail = useExpenseDetail(apartmentId, expenseId);
  const members = useMembers(apartmentId);
  const apartment = useApartment(apartmentId);
  const userId = useCurrentUserId();
  const voidMutation = useVoidExpense(apartmentId, expenseId);

  if (detail.isPending || members.isPending || apartment.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  const loadError = detail.error ?? members.error ?? apartment.error;
  if (loadError || !members.data || !apartment.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load this expense.')}
          onRetry={() => {
            void detail.refetch();
            void members.refetch();
            void apartment.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!detail.data) {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message="This expense is not available. It may belong to an apartment you have left."
        />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  const expense = detail.data;
  const nameOf = (id: string | null) => {
    const member = members.data.find((item) => item.userId === id);
    return member ? memberLabel(member, userId) : 'A former member';
  };
  const money = (amountMinor: number) => `${formatMinorUnits(amountMinor)} ${expense.currency}`;
  const canRecordPayment =
    expense.paidStatus === 'unpaid' &&
    expense.status === 'provisional' &&
    isActiveMember(members.data, userId);
  const canEdit = canEditExpense(
    expense,
    members.data.find((member) => member.userId === userId),
  );
  const confirmVoid = () =>
    Alert.alert(
      'Void this expense?',
      'It stops counting toward anyone’s balance. It stays in the history, and this cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Void', style: 'destructive', onPress: () => voidMutation.mutate() },
      ],
    );

  return (
    <Screen
      padTop={false}
      refreshing={detail.isRefetching}
      onRefresh={() => {
        void detail.refetch();
        void members.refetch();
      }}
    >
      <Card>
        <Card.Body className="gap-2">
          <Typography.Paragraph type="body-xs" color="muted">
            {[formatDate(expense.expenseDate), expense.categoryName].filter(Boolean).join(' · ')}
          </Typography.Paragraph>
          <Typography.Heading type="h4">{expense.title}</Typography.Heading>
          <Typography.Heading
            type="h3"
            className={expense.status === 'void' ? 'line-through' : undefined}
          >
            {money(expense.amountMinor)}
          </Typography.Heading>
          <View className="flex-row">
            <ExpenseStatusChips
              expense={{ status: expense.status, paid_status: expense.paidStatus }}
            />
          </View>
          <Typography.Paragraph type="body-sm" color="muted">
            {describeStatus(expense, apartment.data.timezone)}
          </Typography.Paragraph>
          {expense.dueDate ? (
            <Typography.Paragraph type="body-sm">
              Due {formatDate(expense.dueDate)}
            </Typography.Paragraph>
          ) : null}
          {expense.description ? (
            <Typography.Paragraph type="body-sm">{expense.description}</Typography.Paragraph>
          ) : null}
        </Card.Body>
      </Card>

      {canRecordPayment ? (
        <Button
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/expenses/[expenseId]/record-payment',
              params: { apartmentId, expenseId },
            })
          }
        >
          Record payment
        </Button>
      ) : null}

      {canEdit ? (
        <View className="gap-2">
          <FormAlert
            message={
              voidMutation.error
                ? userErrorMessage(
                    voidMutation.error,
                    'Could not void the expense. Please try again.',
                    EXPENSE_ERROR_MESSAGES,
                  )
                : null
            }
          />
          <View className="flex-row gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onPress={() =>
                router.push({
                  pathname: '/apartments/[apartmentId]/expenses/[expenseId]/edit',
                  params: { apartmentId, expenseId },
                })
              }
              isDisabled={voidMutation.isPending}
            >
              Edit
            </Button>
            <Button
              variant="danger-soft"
              className="flex-1"
              onPress={confirmVoid}
              isDisabled={voidMutation.isPending}
            >
              {voidMutation.isPending ? 'Voiding…' : 'Void'}
            </Button>
          </View>
        </View>
      ) : null}

      {children}

      <Section title="Paid by">
        {expense.payers.length === 0 ? (
          <Typography.Paragraph type="body-sm" color="muted">
            Nobody yet.
          </Typography.Paragraph>
        ) : (
          expense.payers.map((payer) => (
            <AmountRow
              key={payer.userId}
              label={nameOf(payer.userId)}
              amount={money(payer.amountMinor)}
            />
          ))
        )}
      </Section>

      <Section title={SPLIT_METHOD_TITLES[expense.splitMethod]}>
        {expense.splits.map((split) => (
          <AmountRow
            key={split.userId}
            label={nameOf(split.userId)}
            detail={
              expense.splitMethod === 'percentage' && split.basisPoints !== null
                ? `${formatMinorUnits(split.basisPoints)}%`
                : undefined
            }
            amount={money(split.amountMinor)}
          />
        ))}
      </Section>

      <Section title="Who owes whom">
        {whoOwesWhom(expense).map((line) => (
          <Typography.Paragraph key={line.key} type="body-sm">
            {line.debt
              ? line.debt.debtorId === userId
                ? `You owe ${nameOf(line.debt.creditorId)} ${money(line.debt.amountMinor)}`
                : `${nameOf(line.debt.debtorId)} owes ${line.debt.creditorId === userId ? 'you' : nameOf(line.debt.creditorId)} ${money(line.debt.amountMinor)}`
              : line.text}
          </Typography.Paragraph>
        ))}
      </Section>

      <Section title="Receipts">
        <ExpenseReceipts apartmentId={apartmentId} expenseId={expenseId} />
      </Section>

      <Section title="History">
        {expense.history.map((event) => (
          <View key={event.id} className="gap-0.5">
            <Typography.Paragraph type="body-sm">
              {describeHistoryEvent(event, nameOf(event.actorId), money)}
            </Typography.Paragraph>
            {historyReason(event) ? (
              <Typography.Paragraph type="body-xs" color="muted">
                “{historyReason(event)}”
              </Typography.Paragraph>
            ) : null}
            <Typography.Paragraph type="body-xs" color="muted">
              {formatDate(event.createdAt)}
            </Typography.Paragraph>
          </View>
        ))}
      </Section>
    </Screen>
  );
}

function isActiveMember(members: Member[], userId: string): boolean {
  return members.some((member) => member.userId === userId && member.leftAt === null);
}

type OwesLine =
  | { key: string; debt: ReturnType<typeof matchDebts>[number]; text?: undefined }
  | { key: string; debt?: undefined; text: string };

/** The debts this expense creates, or why it creates none. */
function whoOwesWhom(expense: ExpenseDetail): OwesLine[] {
  if (expense.status === 'void') {
    return [{ key: 'void', text: 'Nothing. This expense is void.' }];
  }
  if (expense.paidStatus === 'unpaid') {
    return [{ key: 'unpaid', text: 'Nothing until someone records paying this bill.' }];
  }
  const debts = matchDebts(expense.payers, expense.splits);
  if (debts.length === 0) {
    return [{ key: 'none', text: 'Nothing. Everyone paid their own share.' }];
  }
  return debts.map((debt) => ({ key: `${debt.debtorId}-${debt.creditorId}`, debt }));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>{title}</Card.Title>
        <Separator />
        {children}
      </Card.Body>
    </Card>
  );
}

function AmountRow({ label, detail, amount }: { label: string; detail?: string; amount: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Typography.Paragraph type="body-sm" className="flex-1">
        {label}
        {detail ? (
          <Typography.Paragraph type="body-sm" color="muted">
            {`  ${detail}`}
          </Typography.Paragraph>
        ) : null}
      </Typography.Paragraph>
      <Typography.Paragraph type="body-sm" weight="semibold">
        {amount}
      </Typography.Paragraph>
    </View>
  );
}
