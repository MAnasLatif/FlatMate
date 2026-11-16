import { router } from 'expo-router';
import {
  Button,
  Description,
  FieldError,
  Input,
  Label,
  TextField,
  Typography,
} from 'heroui-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DateField } from '@/components/form/date-field';
import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, loadingError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { Apartment, Member } from '@/features/apartments/api';
import { useApartment, useMembers, useMyMembership } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { ReceiptsField } from '@/features/expenses/components/receipts-field';
import { SplitFields } from '@/features/expenses/components/split-fields';
import { receiptUploadErrorMessage } from '@/features/expenses/errors';
import { useUploadReceipt } from '@/features/expenses/hooks';
import { memberLabel } from '@/features/expenses/member-label';
import { userErrorMessage } from '@/lib/errors';
import type { PickedImage } from '@/lib/private-images';
import { formatDate, todayInTimeZone } from '@/lib/time';

import type { WaitingBill } from '../api';
import { draftFromBill, validateBillDraft } from '../draft';
import { RECURRING_ERROR_MESSAGES } from '../errors';
import { useBillActions, useWaitingBills } from '../hooks';
import { currencySymbol } from '@/features/apartments/currencies';

/**
 * Entering a repeatable bill that waits for an admin: the real amount of a
 * variable bill (SRS FR-04.3), or the split of a fixed one whose split names
 * someone who has left. The split chosen here is for this period only
 * (FR-04.4). Proof is attached as receipts once the charge exists.
 */
export function EnterBillScreen({
  apartmentId,
  instanceId,
}: {
  apartmentId: string;
  instanceId: string;
}) {
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);
  const membership = useMyMembership(apartmentId);
  const isAdmin = membership?.role === 'admin';
  const bills = useWaitingBills(apartmentId, isAdmin);

  if (apartment.isPending || members.isPending || (isAdmin && bills.isPending)) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={5} />
      </Screen>
    );
  }
  const loadError = loadingError(apartment, members, bills);
  if (loadError || !apartment.data || !members.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load the bill.')}
          onRetry={() => {
            void apartment.refetch();
            void members.refetch();
            void bills.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!isAdmin) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message="Only admins of this apartment can enter its bills." />
      </Screen>
    );
  }

  const bill = bills.data?.find((item) => item.id === instanceId);
  return (
    <BillEditor
      apartment={apartment.data}
      members={members.data.filter((member) => member.leftAt === null)}
      bill={bill ?? null}
    />
  );
}

function BillEditor({
  apartment,
  members,
  bill: waitingBill,
}: {
  apartment: Apartment;
  members: Member[];
  bill: WaitingBill | null;
}) {
  const userId = useCurrentUserId();
  const today = todayInTimeZone(apartment.timezone);
  const memberIds = useMemo(() => members.map((member) => member.userId), [members]);
  // The bill leaves the waiting list once it is charged; keep showing it here.
  const [bill] = useState(waitingBill);
  const [draft, setDraft] = useState(() => (bill ? draftFromBill(bill, memberIds) : null));
  const [showErrors, setShowErrors] = useState(false);
  const [receipts, setReceipts] = useState<PickedImage[]>([]);
  const [chargedExpenseId, setChargedExpenseId] = useState<string | null>(null);
  const { post } = useBillActions(apartment.id);
  const upload = useUploadReceipt(apartment.id);
  const result = useMemo(
    () => (bill && draft ? validateBillDraft(draft, bill.billDate, memberIds) : null),
    [bill, draft, memberIds],
  );

  if (!bill || !draft || !result) {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message="This bill is no longer waiting. Another admin may have entered or skipped it."
        />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  const update = (patch: Partial<typeof draft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const error = (field: keyof typeof result.errors) =>
    showErrors ? result.errors[field] : undefined;

  // Uploads the proof one by one; each one that arrives leaves the list, so a
  // retry sends only the rest.
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

  if (chargedExpenseId) {
    return (
      <Screen padTop={false}>
        <FormAlert status="success" message={`${bill.template.title} was charged.`} />
        <FormAlert
          message={
            upload.error
              ? `Some proof was not attached. ${receiptUploadErrorMessage(upload.error)}`
              : null
          }
        />
        <ReceiptsField receipts={receipts} onChange={setReceipts} isDisabled={upload.isPending} />
        <OnlineButton
          onPress={() => void attachAll(chargedExpenseId, receipts)}
          isDisabled={upload.isPending || receipts.length === 0}
        >
          {upload.isPending ? 'Uploading…' : 'Upload proof'}
        </OnlineButton>
        <Button variant="ghost" onPress={() => router.back()} isDisabled={upload.isPending}>
          Finish without it
        </Button>
      </Screen>
    );
  }

  const save = () => {
    setShowErrors(true);
    if (!result.value) return;
    post.mutate(
      { instanceId: bill.id, bill: result.value },
      {
        onSuccess: (expenseId) => {
          if (receipts.length === 0) {
            router.back();
            return;
          }
          setChargedExpenseId(expenseId);
          void attachAll(expenseId, receipts);
        },
      },
    );
  };
  const isSaving = post.isPending || upload.isPending;

  return (
    <Screen padTop={false}>
      <View className="gap-1">
        <Typography.Heading type="h4">{bill.template.title}</Typography.Heading>
        <Typography.Paragraph type="body-sm" color="muted">
          Arrived {formatDate(bill.billDate)}.{' '}
          {bill.reason === 'amount_needed'
            ? 'Enter the amount on the bill. Nothing is charged until you do.'
            : 'Someone in its split has left. Check who shares it this time.'}
        </Typography.Paragraph>
      </View>

      <TextField isRequired isInvalid={error('amount') !== undefined}>
        <Label>Amount ({currencySymbol(apartment.currency)})</Label>
        <Input
          variant="secondary"
          value={draft.amount}
          onChangeText={(amount) => update({ amount })}
          keyboardType="decimal-pad"
          placeholder="0.00"
          accessibilityLabel={`Amount in ${apartment.currency}`}
          testID="bill-amount"
        />
        <FieldError>{error('amount')}</FieldError>
      </TextField>

      <ReceiptsField receipts={receipts} onChange={setReceipts} isDisabled={isSaving} />

      <DateField
        label="Due date"
        value={draft.dueDate}
        onChange={(dueDate) => update({ dueDate })}
        today={today}
        minDate={bill.billDate}
        isClearable
        error={error('dueDate')}
      />

      <View className="gap-2">
        <Label>Who will pay it? (optional)</Label>
        <ChoiceChips
          accessibilityLabel="Who will pay the bill"
          choices={members.map((member) => ({
            value: member.userId,
            label: memberLabel(member, userId),
          }))}
          selected={draft.collectorId}
          onSelect={(collectorId) =>
            update({ collectorId: collectorId === draft.collectorId ? null : collectorId })
          }
        />
        <Description>They are told. Nobody owes anything until the bill is paid.</Description>
      </View>

      <SplitFields
        value={draft}
        onChange={update}
        shares={result.shares}
        error={showErrors || draft.splitMethod !== 'equal' ? result.errors.split : undefined}
        members={members}
        currentUserId={userId}
        currency={apartment.currency}
      />
      <Typography.Paragraph type="body-xs" color="muted">
        This split is for this bill only. To change it for later bills, edit the repeatable expense.
      </Typography.Paragraph>

      <FormAlert
        message={
          post.error
            ? userErrorMessage(
                post.error,
                'Could not charge the bill. Please try again.',
                RECURRING_ERROR_MESSAGES,
              )
            : showErrors && !result.value
              ? 'Check the highlighted fields.'
              : null
        }
      />
      <OnlineButton onPress={save} isDisabled={isSaving} testID="bill-save">
        {post.isPending ? 'Charging…' : 'Charge the bill'}
      </OnlineButton>
    </Screen>
  );
}
