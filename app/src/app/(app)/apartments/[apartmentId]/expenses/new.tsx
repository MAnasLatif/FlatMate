import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { useMemo, useState } from 'react';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, loadingError, LoadingRows } from '@/components/query-states';
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
import { EXPENSE_ERROR_MESSAGES, receiptUploadErrorMessage } from '@/features/expenses/errors';
import { ReceiptsField } from '@/features/expenses/components/receipts-field';
import { usePostExpense, useUploadReceipt } from '@/features/expenses/hooks';
import { userErrorMessage } from '@/lib/errors';
import { todayInTimeZone } from '@/lib/time';
import type { PickedImage } from '@/lib/private-images';
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
  const loadError = loadingError(apartment, members, categories);
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
  const [receipts, setReceipts] = useState<PickedImage[]>([]);
  // Set once the expense is posted, so failed receipt uploads are retried on their own.
  const [savedExpenseId, setSavedExpenseId] = useState<string | null>(null);
  const post = usePostExpense(apartment.id);
  const upload = useUploadReceipt(apartment.id);

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

  // Uploads the receipts one by one. Each one that arrives leaves the list,
  // so a retry after a failure sends only the rest.
  const attachAll = async (expenseId: string, pending: PickedImage[]) => {
    let remaining = pending;
    try {
      for (const receipt of pending) {
        await upload.mutateAsync({ expenseId, receipt });
        remaining = remaining.slice(1);
        setReceipts(remaining);
      }
      router.back();
    } catch {
      // The upload keeps its error for the message on the screen.
    }
  };

  if (savedExpenseId) {
    return (
      <Screen padTop={false}>
        <FormAlert status="success" message="The expense was saved." />
        <FormAlert
          message={
            upload.error
              ? `${receipts.length === 1 ? 'A receipt was' : 'Some receipts were'} not attached. ${receiptUploadErrorMessage(upload.error)}`
              : null
          }
        />
        <ReceiptsField receipts={receipts} onChange={setReceipts} isDisabled={upload.isPending} />
        <OnlineButton
          onPress={() => void attachAll(savedExpenseId, receipts)}
          isDisabled={upload.isPending || receipts.length === 0}
        >
          {upload.isPending ? 'Uploading receipts…' : 'Upload receipts'}
        </OnlineButton>
        <Button variant="ghost" onPress={() => router.back()} isDisabled={upload.isPending}>
          Finish without them
        </Button>
      </Screen>
    );
  }

  const save = () => {
    setShowErrors(true);
    if (!result.value) return;
    post.mutate(
      { expense: result.value, requestId },
      {
        onSuccess: (expenseId) => {
          if (receipts.length === 0) {
            router.back();
            return;
          }
          setSavedExpenseId(expenseId);
          void attachAll(expenseId, receipts);
        },
      },
    );
  };
  const isSaving = post.isPending || upload.isPending;

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
        afterDate={
          <ReceiptsField receipts={receipts} onChange={setReceipts} isDisabled={isSaving} />
        }
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
      <OnlineButton onPress={save} isDisabled={isSaving}>
        {post.isPending ? 'Saving…' : 'Save expense'}
      </OnlineButton>
    </Screen>
  );
}
