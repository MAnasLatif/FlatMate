import {
  Card,
  ControlField,
  Description,
  FieldError,
  Input,
  Label,
  TextArea,
  TextField,
} from 'heroui-native';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { DateField } from '@/components/form/date-field';
import type { Category, Member } from '@/features/apartments/api';

import { CATEGORY_DETAIL_MAX_LENGTH, type DraftResult, type ExpenseDraft } from '../draft';
import { memberLabel } from '../member-label';
import { PayerFields } from './payer-fields';
import { SplitFields } from './split-fields';

type ExpenseFormProps = {
  draft: ExpenseDraft;
  setDraft: Dispatch<SetStateAction<ExpenseDraft>>;
  result: DraftResult;
  /** Show field errors only after the first attempt to save. */
  showErrors: boolean;
  members: Member[];
  categories: Category[];
  currency: string;
  today: string;
  currentUserId: string;
  /**
   * Whether the expense is already paid is fixed, as when editing a posted
   * expense: an unpaid bill is paid by recording who paid it.
   */
  isPaidStatusFixed?: boolean;
  /** Shown fourth, after the title, amount and date, such as the receipts when adding. */
  afterDate?: ReactNode;
};

/** The fields of an expense: details, who paid, how it is split, then notes. */
export function ExpenseForm(props: ExpenseFormProps) {
  return (
    <View className="gap-6">
      <DetailsSection {...props} />
      <PaidSection {...props} />
      <SplitSection {...props} />
      <NotesSection {...props} />
    </View>
  );
}

function DetailsSection({
  draft,
  setDraft,
  result,
  showErrors,
  categories,
  currency,
  today,
  afterDate,
}: ExpenseFormProps) {
  const error = (field: keyof DraftResult['errors']) =>
    showErrors ? result.errors[field] : undefined;
  const update = (patch: Partial<ExpenseDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  return (
    <View className="gap-4">
      <TextField isRequired isInvalid={error('title') !== undefined}>
        <Label>What was it for?</Label>
        <Input
          variant="secondary"
          value={draft.title}
          onChangeText={(title) => update({ title })}
          placeholder="Cleaning, groceries, repairs…"
          accessibilityLabel="What was it for?"
        />
        <FieldError>{error('title')}</FieldError>
      </TextField>

      <TextField isRequired isInvalid={error('amount') !== undefined}>
        <Label>Amount ({currency})</Label>
        <Input
          variant="secondary"
          value={draft.amount}
          onChangeText={(amount) => update({ amount })}
          keyboardType="decimal-pad"
          placeholder="0.00"
          accessibilityLabel={`Amount in ${currency}`}
        />
        <FieldError>{error('amount')}</FieldError>
      </TextField>

      <DateField
        label="Date"
        isRequired
        value={draft.expenseDate}
        onChange={(expenseDate) => update({ expenseDate })}
        today={today}
        error={error('expenseDate')}
      />
      {afterDate}

      {categories.length > 0 ? (
        <View className="gap-2">
          <Label>Category</Label>
          <ChoiceChips
            accessibilityLabel="Category"
            choices={categories.map((category) => ({ value: category.id, label: category.name }))}
            selected={draft.categoryId}
            onSelect={(categoryId) =>
              update({
                categoryId: categoryId === draft.categoryId ? null : categoryId,
                // What Other was belongs to Other only.
                categoryDetail: '',
              })
            }
          />
          {isOtherCategory(categories, draft.categoryId) ? (
            <TextField isInvalid={error('categoryDetail') !== undefined}>
              <Label>What was it?</Label>
              <Input
                variant="secondary"
                value={draft.categoryDetail}
                onChangeText={(categoryDetail) => update({ categoryDetail })}
                placeholder="Gas cylinder, repairs, a gift…"
                maxLength={CATEGORY_DETAIL_MAX_LENGTH}
                accessibilityLabel="What the other expense was"
              />
              <FieldError>{error('categoryDetail')}</FieldError>
            </TextField>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Whether the chosen category is the catch-all Other, which asks what it was. */
function isOtherCategory(categories: readonly Category[], categoryId: string | null): boolean {
  const name = categories.find((category) => category.id === categoryId)?.name;
  return name?.trim().toLowerCase() === 'other';
}

/** Optional notes, last: most expenses need none. */
function NotesSection({ draft, setDraft, result, showErrors }: ExpenseFormProps) {
  const error = showErrors ? result.errors.description : undefined;
  return (
    <TextField isInvalid={error !== undefined}>
      <Label>Notes (optional)</Label>
      <TextArea
        variant="secondary"
        value={draft.description}
        onChangeText={(description) => setDraft((current) => ({ ...current, description }))}
        accessibilityLabel="Notes"
      />
      <FieldError>{error}</FieldError>
    </TextField>
  );
}

function PaidSection({
  draft,
  setDraft,
  result,
  showErrors,
  members,
  currentUserId,
  currency,
  today,
  isPaidStatusFixed = false,
}: ExpenseFormProps) {
  const update = (patch: Partial<ExpenseDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const payersError = showErrors ? result.errors.payers : undefined;
  const dueDateError = showErrors ? result.errors.dueDate : undefined;

  return (
    <Card>
      <Card.Body className="gap-4">
        {isPaidStatusFixed ? (
          draft.paidNow ? null : (
            <Description>
              This bill is not paid yet. Record who paid it from the expense screen.
            </Description>
          )
        ) : (
          <ControlField
            isSelected={draft.paidNow}
            onSelectedChange={(paidNow) => update({ paidNow })}
          >
            <View className="flex-1">
              <Label>Already paid</Label>
              <Description>
                Turn off for a bill that someone still has to pay, such as electricity. It creates
                no debts until a flatmate pays it.
              </Description>
            </View>
            <ControlField.Indicator />
          </ControlField>
        )}

        {draft.paidNow ? (
          <PayerFields
            value={draft}
            onChange={update}
            members={members}
            currentUserId={currentUserId}
            currency={currency}
            error={payersError}
          />
        ) : null}

        {draft.paidNow ? null : (
          <View className="gap-2">
            <Label>Who will pay it? (optional)</Label>
            <ChoiceChips
              accessibilityLabel="Who will pay the bill"
              choices={members
                .filter((member) => member.leftAt === null)
                .map((member) => ({
                  value: member.userId,
                  label: memberLabel(member, currentUserId),
                }))}
              selected={draft.collectorId}
              onSelect={(collectorId) =>
                update({ collectorId: collectorId === draft.collectorId ? null : collectorId })
              }
            />
            <Description>They are told. Nobody owes anything until the bill is paid.</Description>
          </View>
        )}

        {draft.paidNow ? null : (
          <DateField
            label="Due date"
            value={draft.dueDate}
            onChange={(dueDate) => update({ dueDate })}
            today={today}
            // A bill is not due before the day it is for.
            minDate={draft.expenseDate || undefined}
            isClearable
            error={dueDateError}
          />
        )}
      </Card.Body>
    </Card>
  );
}

function SplitSection({
  draft,
  setDraft,
  result,
  showErrors,
  members,
  currentUserId,
  currency,
}: ExpenseFormProps) {
  return (
    <SplitFields
      value={draft}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      shares={result.shares}
      error={showErrors || draft.splitMethod !== 'equal' ? result.errors.split : undefined}
      members={members}
      currentUserId={currentUserId}
      currency={currency}
    />
  );
}
