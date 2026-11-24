import { router, useLocalSearchParams } from 'expo-router';
import { Button, Typography } from 'heroui-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { type Choice, ChoiceChips } from '@/components/choice-chips';
import { useConfirm } from '@/components/confirm-dialog';
import { FormAlert } from '@/components/form/form-alert';
import { SwitchRow } from '@/components/form/switch-row';
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
import {
  useQueuedExpenses,
  useQueueExpense,
  useRemoveQueuedExpense,
} from '@/features/expenses/offline-queue-hooks';
import {
  draftForMembers,
  MAX_QUEUED_PER_APARTMENT,
  type QueuedExpense,
  QueueLimitError,
} from '@/features/expenses/offline-queue';
import type { CostKind } from '@/features/inventory/api';
import { INVENTORY_ERROR_MESSAGES } from '@/features/inventory/errors';
import { useInventory, useLinkInventoryCost } from '@/features/inventory/hooks';
import { COST_KIND_LABEL } from '@/features/inventory/items';
import { RoomSplitPanel } from '@/features/rooms/components/room-split-panel';
import { QuickAddChips } from '@/features/quick-add/components/quick-add-chips';
import type { QuickAddInput } from '@/features/quick-add/api';
import { QUICK_ADD_ERROR_MESSAGES } from '@/features/quick-add/errors';
import { useSaveQuickAdd } from '@/features/quick-add/hooks';
import { applyQuickAdd, quickAddFromExpense } from '@/features/quick-add/templates';
import { userErrorMessage } from '@/lib/errors';
import { useIsOnline } from '@/lib/network';
import { formatDateTime, todayInTimeZone } from '@/lib/time';
import type { PickedImage } from '@/lib/private-images';
import { randomUuid } from '@/lib/uuid';

const COST_KINDS: Choice<CostKind>[] = [
  { value: 'purchase', label: COST_KIND_LABEL.purchase },
  { value: 'maintenance', label: COST_KIND_LABEL.maintenance },
];

/** The inventory item a new expense is a cost of, when opened from the item. */
type ItemCost = { itemId: string; kind: CostKind };

export default function AddExpenseScreen() {
  const apartmentId = useApartmentId();
  const params = useLocalSearchParams<{ itemId?: string; costKind?: string; queuedId?: string }>();
  const itemCost: ItemCost | null = params.itemId
    ? { itemId: params.itemId, kind: params.costKind === 'purchase' ? 'purchase' : 'maintenance' }
    : null;
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);
  const categories = useCategories(apartmentId);
  // The queue is read from the phone, so this works offline too.
  const queue = useQueuedExpenses(apartmentId);
  const queued = params.queuedId
    ? queue.data?.find((expense) => expense.id === params.queuedId)
    : undefined;

  if (
    apartment.isPending ||
    members.isPending ||
    categories.isPending ||
    (params.queuedId && queue.isPending)
  ) {
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

  if (params.queuedId && !queued) {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message="This expense is no longer waiting on this phone. It may have been sent or deleted already."
        />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  return (
    <AddExpenseForm
      // A different queued expense is a different form.
      key={queued?.id ?? 'new'}
      queued={queued}
      apartment={apartment.data}
      members={members.data.filter((member) => member.leftAt === null)}
      categories={categories.data}
      itemCost={itemCost}
    />
  );
}

function AddExpenseForm({
  apartment,
  members,
  categories,
  itemCost,
  queued,
}: {
  apartment: Apartment;
  members: Member[];
  categories: Category[];
  itemCost: ItemCost | null;
  /** An expense saved offline and not sent yet, opened to change, fix or delete. */
  queued: QueuedExpense | undefined;
}) {
  const userId = useCurrentUserId();
  const today = todayInTimeZone(apartment.timezone);
  const isOnline = useIsOnline();
  const [draft, setDraft] = useState(() =>
    queued
      ? draftForMembers(
          queued,
          members.map((member) => member.userId),
        )
      : newDraft(userId, today),
  );
  // One id per expense being added, so a retried save cannot create a
  // duplicate. A queued expense keeps its id, so it is added once however it
  // is sent: by itself on reconnect, or from here.
  const [requestId] = useState(() => queued?.id ?? randomUuid());
  const queueExpense = useQueueExpense();
  const removeQueued = useRemoveQueuedExpense();
  const { confirm, dialog } = useConfirm();
  const [showErrors, setShowErrors] = useState(false);
  const [receipts, setReceipts] = useState<PickedImage[]>([]);
  // Set once the expense is posted, so failed receipt uploads are retried on their own.
  const [savedExpenseId, setSavedExpenseId] = useState<string | null>(null);
  // A quick-add that failed to save after the expense was, kept to retry.
  const [pendingQuickAdd, setPendingQuickAdd] = useState<QuickAddInput | null>(null);
  const [saveAsQuickAdd, setSaveAsQuickAdd] = useState(false);
  const [costKind, setCostKind] = useState<CostKind>(itemCost?.kind ?? 'maintenance');
  // Set when counting the saved expense towards its item failed, to retry.
  const [linkFailed, setLinkFailed] = useState(false);
  const post = usePostExpense(apartment.id);
  // Only to name the item an expense is added from.
  const inventory = useInventory(apartment.id, itemCost !== null);
  const linkCost = useLinkInventoryCost(apartment.id);
  const itemName = itemCost
    ? (inventory.data?.find((item) => item.id === itemCost.itemId)?.name ?? 'the item')
    : null;
  const upload = useUploadReceipt(apartment.id);
  const saveQuickAdd = useSaveQuickAdd(apartment.id);

  const memberIds = useMemo(() => members.map((member) => member.userId), [members]);
  const categoryIds = useMemo(() => categories.map((category) => category.id), [categories]);
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

  // Saves the quick-add the user asked for. False when it failed, which the
  // screen then explains; the expense itself is saved either way.
  const saveTemplate = async (input: QuickAddInput): Promise<boolean> => {
    try {
      await saveQuickAdd.mutateAsync(input);
      return true;
    } catch {
      return false;
    }
  };

  // Counts the saved expense towards the item it was added from. False when
  // that failed, which the screen then explains; the expense is saved either way.
  const linkToItem = async (expenseId: string): Promise<boolean> => {
    if (!itemCost) return true;
    try {
      await linkCost.mutateAsync({ expenseId, itemId: itemCost.itemId, kind: costKind });
      setLinkFailed(false);
      return true;
    } catch {
      setLinkFailed(true);
      return false;
    }
  };

  if (savedExpenseId) {
    const quickAddFailed = saveQuickAdd.isError && pendingQuickAdd !== null;
    const isBusy = upload.isPending || saveQuickAdd.isPending || linkCost.isPending;
    return (
      <Screen padTop={false}>
        <FormAlert status="success" message="The expense was saved." />
        {quickAddFailed ? (
          <>
            <FormAlert
              message={`The quick-add was not saved. ${userErrorMessage(saveQuickAdd.error, 'Please try again.', QUICK_ADD_ERROR_MESSAGES)}`}
            />
            <OnlineButton
              variant="secondary"
              onPress={() =>
                void saveTemplate(pendingQuickAdd).then((saved) => {
                  if (saved) setPendingQuickAdd(null);
                })
              }
              isDisabled={isBusy}
            >
              {saveQuickAdd.isPending ? 'Saving the quick-add…' : 'Save the quick-add again'}
            </OnlineButton>
          </>
        ) : null}
        {linkFailed ? (
          <>
            <FormAlert
              message={`It does not count towards ${itemName} yet. ${userErrorMessage(linkCost.error, 'Please try again.', INVENTORY_ERROR_MESSAGES)}`}
            />
            <OnlineButton
              variant="secondary"
              onPress={() => void linkToItem(savedExpenseId)}
              isDisabled={isBusy}
            >
              {linkCost.isPending ? 'Saving…' : `Count it towards ${itemName} again`}
            </OnlineButton>
          </>
        ) : null}
        {receipts.length > 0 || upload.isError ? (
          <>
            <FormAlert
              message={
                upload.error
                  ? `${receipts.length === 1 ? 'A receipt was' : 'Some receipts were'} not attached. ${receiptUploadErrorMessage(upload.error)}`
                  : null
              }
            />
            <ReceiptsField
              receipts={receipts}
              onChange={setReceipts}
              isDisabled={upload.isPending}
            />
            <OnlineButton
              onPress={() => void attachAll(savedExpenseId, receipts)}
              isDisabled={isBusy || receipts.length === 0}
            >
              {upload.isPending ? 'Uploading receipts…' : 'Upload receipts'}
            </OnlineButton>
          </>
        ) : null}
        <Button variant="ghost" onPress={() => router.back()} isDisabled={isBusy}>
          {receipts.length > 0 ? 'Finish without them' : 'Finish'}
        </Button>
      </Screen>
    );
  }

  // Offline, the expense waits on the phone and is sent by itself once the
  // connection is back (decision 0018).
  const saveOffline = () => {
    setShowErrors(true);
    if (!result.value) return;
    queueExpense.mutate(
      {
        id: requestId,
        apartmentId: apartment.id,
        savedAt: new Date().toISOString(),
        draft,
        memberIds,
        failure: null,
      },
      { onSuccess: () => router.back() },
    );
  };

  const save = () => {
    setShowErrors(true);
    if (!result.value) return;
    const quickAdd = saveAsQuickAdd ? quickAddFromExpense(result.value, memberIds) : null;
    post.mutate(
      { expense: result.value, requestId },
      {
        onSuccess: async (expenseId) => {
          // The expense is added, so it leaves the queue. Should that fail,
          // sending it again returns this same expense.
          if (queued) {
            removeQueued.mutate(queued.id, {
              onError: () => console.warn('A sent expense could not be taken off the queue.'),
            });
          }
          const linked = await linkToItem(expenseId);
          const quickAddSaved = !quickAdd || (await saveTemplate(quickAdd));
          if (!quickAddSaved) setPendingQuickAdd(quickAdd);
          if (!linked || !quickAddSaved) {
            setSavedExpenseId(expenseId);
            return;
          }
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
  const isSaving =
    post.isPending ||
    upload.isPending ||
    saveQuickAdd.isPending ||
    linkCost.isPending ||
    queueExpense.isPending;
  const queueError =
    queueExpense.error instanceof QueueLimitError
      ? `${MAX_QUEUED_PER_APARTMENT} expenses in this apartment are already waiting to be sent. Wait until you are back online.`
      : queueExpense.error
        ? 'Could not save it on this phone. Please try again.'
        : null;

  return (
    <Screen padTop={false}>
      {queued ? (
        <View className="gap-2">
          <FormAlert
            status={queued.failure ? 'danger' : 'warning'}
            message={
              queued.failure
                ? `Not sent: ${queued.failure} Fix it, then save it.`
                : `Saved on this phone on ${formatDateTime(Date.parse(queued.savedAt))} and not sent yet. It is sent by itself when you are back online.`
            }
          />
          <Button
            size="sm"
            variant="ghost"
            onPress={() =>
              confirm({
                title: 'Delete this expense?',
                description:
                  'It was never sent, so nothing was added. It is deleted from this phone.',
                confirmLabel: 'Delete',
                isDestructive: true,
                onConfirm: () => removeQueued.mutate(queued.id, { onSuccess: () => router.back() }),
              })
            }
          >
            Delete it
          </Button>
        </View>
      ) : null}
      {isOnline ? null : (
        <FormAlert
          status="warning"
          message={`You are offline. Saving keeps it on this phone, and it is sent by itself when you are back online. Attach receipts once it has been sent${itemCost ? ', and choose the item on the expense' : ''}.`}
        />
      )}
      {itemCost && isOnline ? (
        <View className="gap-2">
          <Typography.Paragraph type="body-sm">
            This expense will count towards {itemName} as:
          </Typography.Paragraph>
          <ChoiceChips
            choices={COST_KINDS}
            selected={costKind}
            onSelect={setCostKind}
            accessibilityLabel={`What this expense is for ${itemName}`}
          />
        </View>
      ) : null}
      <QuickAddChips
        apartmentId={apartment.id}
        onPick={(template) =>
          setDraft((current) => applyQuickAdd(current, template, memberIds, categoryIds))
        }
      />
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
        // The queue keeps no photos, so receipts are attached once it is sent.
        afterDate={
          isOnline ? (
            <ReceiptsField receipts={receipts} onChange={setReceipts} isDisabled={isSaving} />
          ) : null
        }
        afterSplit={
          <RoomSplitPanel
            apartmentId={apartment.id}
            draft={draft}
            setDraft={setDraft}
            members={members}
            currentUserId={userId}
            currency={apartment.currency}
            today={today}
          />
        }
      />
      {isOnline ? (
        <SwitchRow
          label="Save as a quick-add"
          description="Fill in this name, amount, category and split with one tap next time. A quick-add with the same name is replaced."
          isSelected={saveAsQuickAdd}
          onSelectedChange={setSaveAsQuickAdd}
        />
      ) : null}
      <FormAlert
        message={
          queueError ??
          (post.error
            ? userErrorMessage(
                post.error,
                'Could not save the expense. Please try again.',
                EXPENSE_ERROR_MESSAGES,
              )
            : showErrors && !result.value
              ? 'Check the highlighted fields.'
              : null)
        }
      />
      {isOnline ? (
        <OnlineButton onPress={save} isDisabled={isSaving}>
          {post.isPending ? 'Saving…' : 'Save expense'}
        </OnlineButton>
      ) : (
        <Button onPress={saveOffline} isDisabled={isSaving}>
          {queueExpense.isPending ? 'Saving…' : 'Save offline'}
        </Button>
      )}
      {dialog}
    </Screen>
  );
}
