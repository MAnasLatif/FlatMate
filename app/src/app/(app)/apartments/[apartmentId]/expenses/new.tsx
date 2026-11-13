import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { useMemo, useState } from 'react';

import { FormAlert } from '@/components/form/form-alert';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { Apartment, Category, Member } from '@/features/apartments/api';
import {
  useApartment,
  useApartmentId,
  useCategories,
  useMembers,
} from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { ExpenseForm } from '@/features/expenses/components/expense-form';
import { newDraft, validateDraft } from '@/features/expenses/draft';
import { EXPENSE_ERROR_MESSAGES } from '@/features/expenses/errors';
import { usePostExpense } from '@/features/expenses/hooks';
import { userErrorMessage } from '@/lib/errors';
import { todayInTimeZone } from '@/lib/time';
import { randomUuid } from '@/lib/uuid';

export default function AddExpenseScreen() {
  const apartmentId = useApartmentId();
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);
  const categories = useCategories(apartmentId);

  if (apartment.isPending || members.isPending || categories.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  const loadError = apartment.error ?? members.error ?? categories.error;
  if (loadError || !apartment.data || !members.data || !categories.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load the apartment.')}
          onRetry={() => {
            void apartment.refetch();
            void members.refetch();
            void categories.refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <AddExpenseForm
      apartment={apartment.data}
      members={members.data.filter((member) => member.leftAt === null)}
      categories={categories.data}
    />
  );
}

function AddExpenseForm({
  apartment,
  members,
  categories,
}: {
  apartment: Apartment;
  members: Member[];
  categories: Category[];
}) {
  const userId = useCurrentUserId();
  const today = todayInTimeZone(apartment.timezone);
  const [draft, setDraft] = useState(() => newDraft(userId, today));
  // One id per expense being added, so a retried save cannot create a duplicate.
  const [requestId] = useState(randomUuid);
  const [showErrors, setShowErrors] = useState(false);
  const post = usePostExpense(apartment.id);

  const memberIds = useMemo(() => members.map((member) => member.userId), [members]);
  const result = useMemo(() => validateDraft(draft, memberIds), [draft, memberIds]);
  const me = members.find((member) => member.userId === userId);

  if (me && !me.canAddExpense) {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message="An admin has turned off adding expenses for you in this apartment."
        />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  const save = () => {
    setShowErrors(true);
    if (result.value) {
      post.mutate({ expense: result.value, requestId }, { onSuccess: () => router.back() });
    }
  };

  return (
    <Screen padTop={false}>
      <ExpenseForm
        draft={draft}
        setDraft={setDraft}
        result={result}
        showErrors={showErrors}
        members={members}
        categories={categories}
        currency={apartment.currency}
        today={today}
        currentUserId={userId}
      />
      <FormAlert
        message={
          post.error
            ? userErrorMessage(
                post.error,
                'Could not save the expense. Please try again.',
                EXPENSE_ERROR_MESSAGES,
              )
            : showErrors && !result.value
              ? 'Check the highlighted fields.'
              : null
        }
      />
      <Button onPress={save} isDisabled={post.isPending}>
        {post.isPending ? 'Saving…' : 'Save expense'}
      </Button>
    </Screen>
  );
}
