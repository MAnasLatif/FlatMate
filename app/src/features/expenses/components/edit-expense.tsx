import { router } from 'expo-router';
import { Button, Label, TextArea, TextField, Typography } from 'heroui-native';
import { useMemo, useState } from 'react';

import { FormAlert } from '@/components/form/form-alert';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { Apartment, Category, Member } from '@/features/apartments/api';
import { useApartment, useCategories, useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { userErrorMessage } from '@/lib/errors';
import { todayInTimeZone } from '@/lib/time';

import type { ExpenseDetail } from '../api';
import { canEditExpense } from '../detail';
import { draftFromExpense, validateDraft } from '../draft';
import { EXPENSE_ERROR_MESSAGES } from '../errors';
import { useEditExpense, useExpenseDetail } from '../hooks';
import { ExpenseForm } from './expense-form';

const REASON_MAX_LENGTH = 500;

/** Edits a posted expense. Money changes become a new revision on the server. */
export function EditExpense({
  apartmentId,
  expenseId,
}: {
  apartmentId: string;
  expenseId: string;
}) {
  const userId = useCurrentUserId();
  const detail = useExpenseDetail(apartmentId, expenseId);
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);
  const categories = useCategories(apartmentId);

  if (detail.isPending || apartment.isPending || members.isPending || categories.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  const loadError = detail.error ?? apartment.error ?? members.error ?? categories.error;
  if (loadError || !apartment.data || !members.data || !categories.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load this expense.')}
          onRetry={() => {
            void detail.refetch();
            void apartment.refetch();
            void members.refetch();
            void categories.refetch();
          }}
        />
      </Screen>
    );
  }

  const viewer = members.data.find((member) => member.userId === userId);
  if (!detail.data || !canEditExpense(detail.data, viewer)) {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message={
            detail.data?.status === 'disputed'
              ? EXPENSE_ERROR_MESSAGES.expense_disputed
              : detail.data?.status === 'void'
                ? EXPENSE_ERROR_MESSAGES.expense_void
                : EXPENSE_ERROR_MESSAGES.not_allowed_to_edit_expense
          }
        />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  return (
    <EditExpenseForm
      apartment={apartment.data}
      expense={detail.data}
      members={formMembers(members.data, detail.data)}
      categories={categories.data}
    />
  );
}

/** Current members, plus anyone who has left but is still part of the expense. */
function formMembers(members: Member[], expense: ExpenseDetail): Member[] {
  const parties = new Set([
    ...expense.splits.map((split) => split.userId),
    ...expense.payers.map((payer) => payer.userId),
  ]);
  return members.filter((member) => member.leftAt === null || parties.has(member.userId));
}

function EditExpenseForm({
  apartment,
  expense,
  members,
  categories,
}: {
  apartment: Apartment;
  expense: ExpenseDetail;
  members: Member[];
  categories: Category[];
}) {
  const userId = useCurrentUserId();
  const today = todayInTimeZone(apartment.timezone);
  const memberIds = useMemo(() => members.map((member) => member.userId), [members]);
  const [draft, setDraft] = useState(() => draftFromExpense(expense, memberIds, userId));
  // The revision this edit starts from. A refetch while editing must not move it,
  // or a money edit could silently replace someone else's newer version.
  const [baseRevision] = useState(expense.revision);
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const edit = useEditExpense(apartment.id, expense.id);

  const result = useMemo(() => validateDraft(draft, memberIds), [draft, memberIds]);
  const reasonError =
    reason.trim().length > REASON_MAX_LENGTH
      ? `Use at most ${REASON_MAX_LENGTH} characters.`
      : undefined;

  const save = () => {
    setShowErrors(true);
    if (!result.value || reasonError) return;
    edit.mutate(
      { expectedRevision: baseRevision, expense: result.value, reason: reason.trim() || null },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen padTop={false}>
      <Typography.Paragraph type="body-sm" color="muted">
        Changing the amount, the split or who paid saves a new version. Everyone in it can object
        again, and the history keeps the old version.
      </Typography.Paragraph>
      <ExpenseForm
        draft={draft}
        setDraft={setDraft}
        result={result}
        showErrors={showErrors}
        members={members}
        categories={categories}
        currency={expense.currency}
        today={today}
        currentUserId={userId}
        isPaidStatusFixed
      />
      <TextField isInvalid={reasonError !== undefined}>
        <Label>Reason for the change (optional)</Label>
        <TextArea
          value={reason}
          onChangeText={setReason}
          placeholder="Wrong amount, someone else paid…"
          accessibilityLabel="Reason for the change"
        />
      </TextField>
      <FormAlert
        message={
          edit.error
            ? userErrorMessage(
                edit.error,
                'Could not save your changes. Please try again.',
                EXPENSE_ERROR_MESSAGES,
              )
            : (reasonError ??
              (showErrors && !result.value ? 'Check the highlighted fields.' : null))
        }
      />
      <Button onPress={save} isDisabled={edit.isPending}>
        {edit.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </Screen>
  );
}
