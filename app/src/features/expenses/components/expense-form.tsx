import {
  Card,
  ControlField,
  Description,
  FieldError,
  Input,
  Label,
  Tabs,
  TextArea,
  TextField,
  Typography,
} from 'heroui-native';
import type { Dispatch, SetStateAction } from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import type { Category, Member } from '@/features/apartments/api';
import { formatMinorUnits } from '@/lib/money';
import { addDays } from '@/lib/time';

import type { DraftResult, ExpenseDraft } from '../draft';
import type { SplitMethod } from '../split';

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
};

export function memberLabel(member: Pick<Member, 'userId' | 'displayName'>, currentUserId: string) {
  if (member.userId === currentUserId) return 'You';
  return member.displayName ?? 'Unnamed member';
}

/** The fields of an expense: details, who paid, how it is split, and a preview. */
export function ExpenseForm(props: ExpenseFormProps) {
  return (
    <View className="gap-6">
      <DetailsSection {...props} />
      <PaidSection {...props} />
      <SplitSection {...props} />
      <PreviewSection {...props} />
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
          value={draft.title}
          onChangeText={(title) => update({ title })}
          placeholder="Cleaning, groceries, rent…"
          accessibilityLabel="What was it for?"
        />
        <FieldError>{error('title')}</FieldError>
      </TextField>

      <TextField isRequired isInvalid={error('amount') !== undefined}>
        <Label>Amount ({currency})</Label>
        <Input
          value={draft.amount}
          onChangeText={(amount) => update({ amount })}
          keyboardType="decimal-pad"
          placeholder="0.00"
          accessibilityLabel={`Amount in ${currency}`}
        />
        <FieldError>{error('amount')}</FieldError>
      </TextField>

      <TextField isRequired isInvalid={error('expenseDate') !== undefined}>
        <Label>Date</Label>
        <Input
          value={draft.expenseDate}
          onChangeText={(expenseDate) => update({ expenseDate })}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          accessibilityLabel="Date, as year-month-day"
        />
        <FieldError>{error('expenseDate')}</FieldError>
      </TextField>
      <ChoiceChips
        accessibilityLabel="Quick date"
        choices={[
          { value: today, label: 'Today' },
          { value: addDays(today, -1), label: 'Yesterday' },
        ]}
        selected={draft.expenseDate}
        onSelect={(expenseDate) => update({ expenseDate })}
      />

      {categories.length > 0 ? (
        <View className="gap-2">
          <Label>Category</Label>
          <ChoiceChips
            accessibilityLabel="Category"
            choices={categories.map((category) => ({ value: category.id, label: category.name }))}
            selected={draft.categoryId}
            onSelect={(categoryId) =>
              update({ categoryId: categoryId === draft.categoryId ? null : categoryId })
            }
          />
        </View>
      ) : null}

      <TextField isInvalid={error('description') !== undefined}>
        <Label>Notes (optional)</Label>
        <TextArea
          value={draft.description}
          onChangeText={(description) => update({ description })}
          accessibilityLabel="Notes"
        />
        <FieldError>{error('description')}</FieldError>
      </TextField>
    </View>
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
}: ExpenseFormProps) {
  const update = (patch: Partial<ExpenseDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const payersError = showErrors ? result.errors.payers : undefined;
  const dueDateError = showErrors ? result.errors.dueDate : undefined;

  return (
    <Card>
      <Card.Body className="gap-4">
        <ControlField
          isSelected={draft.paidNow}
          onSelectedChange={(paidNow) => update({ paidNow })}
        >
          <View className="flex-1">
            <Label>Already paid</Label>
            <Description>
              Turn off for a bill that someone still has to pay, such as electricity. It creates no
              debts until a flatmate pays it.
            </Description>
          </View>
          <ControlField.Indicator />
        </ControlField>

        {draft.paidNow ? (
          <View className="gap-3">
            <Label>Who paid?</Label>
            <ChoiceChips
              accessibilityLabel="Who paid"
              choices={[
                ...members.map((member) => ({
                  value: member.userId,
                  label: memberLabel(member, currentUserId),
                })),
                { value: 'several', label: 'Several people' },
              ]}
              selected={draft.payerMode === 'multiple' ? 'several' : draft.payerId}
              onSelect={(value) =>
                value === 'several'
                  ? update({ payerMode: 'multiple' })
                  : update({ payerMode: 'single', payerId: value })
              }
            />
            {draft.payerMode === 'multiple'
              ? members.map((member) => (
                  <TextField key={member.userId}>
                    <Label>{memberLabel(member, currentUserId)} paid</Label>
                    <Input
                      value={draft.payerAmounts[member.userId] ?? ''}
                      onChangeText={(text) =>
                        setDraft((current) => ({
                          ...current,
                          payerAmounts: { ...current.payerAmounts, [member.userId]: text },
                        }))
                      }
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      accessibilityLabel={`${memberLabel(member, currentUserId)} paid, in ${currency}`}
                    />
                  </TextField>
                ))
              : null}
            {payersError ? <FieldError isInvalid>{payersError}</FieldError> : null}
          </View>
        ) : null}

        <TextField isInvalid={dueDateError !== undefined}>
          <Label>{draft.paidNow ? 'Due date (optional)' : 'Due date'}</Label>
          <Input
            value={draft.dueDate}
            onChangeText={(dueDate) => update({ dueDate })}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="Due date, as year-month-day"
          />
          <FieldError>{dueDateError}</FieldError>
        </TextField>
      </Card.Body>
    </Card>
  );
}

const METHOD_LABELS: Record<SplitMethod, string> = {
  equal: 'Equally',
  percentage: 'By %',
  fixed: 'By amount',
};

function SplitSection({
  draft,
  setDraft,
  result,
  showErrors,
  members,
  currentUserId,
  currency,
}: ExpenseFormProps) {
  const shares = new Map(result.shares?.map((share) => [share.userId, share.amountMinor]));
  const splitError = showErrors || draft.splitMethod !== 'equal' ? result.errors.split : undefined;

  const toggle = (userId: string, included: boolean) =>
    setDraft((current) => ({
      ...current,
      excluded: included
        ? current.excluded.filter((id) => id !== userId)
        : [...current.excluded, userId],
    }));

  return (
    <Card>
      <Card.Body className="gap-4">
        <Card.Title>Split</Card.Title>
        <Tabs
          value={draft.splitMethod}
          onValueChange={(value) =>
            setDraft((current) => ({ ...current, splitMethod: value as SplitMethod }))
          }
        >
          <Tabs.List>
            <Tabs.Indicator />
            {(Object.keys(METHOD_LABELS) as SplitMethod[]).map((method) => (
              <Tabs.Trigger key={method} value={method}>
                <Tabs.Label>{METHOD_LABELS[method]}</Tabs.Label>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>

        {members.map((member) => {
          const included = !draft.excluded.includes(member.userId);
          const label = memberLabel(member, currentUserId);
          const share = shares.get(member.userId);
          return (
            <View key={member.userId} className="gap-2">
              <ControlField
                isSelected={included}
                onSelectedChange={(value) => toggle(member.userId, value)}
              >
                <View className="flex-1">
                  <Label>{label}</Label>
                  <Description>
                    {included
                      ? share !== undefined
                        ? `Share: ${formatMinorUnits(share)} ${currency}`
                        : 'Included'
                      : 'Not included'}
                  </Description>
                </View>
                <ControlField.Indicator />
              </ControlField>
              {included && draft.splitMethod === 'percentage' ? (
                <TextField>
                  <Input
                    value={draft.percentages[member.userId] ?? ''}
                    onChangeText={(text) =>
                      setDraft((current) => ({
                        ...current,
                        percentages: { ...current.percentages, [member.userId]: text },
                      }))
                    }
                    keyboardType="decimal-pad"
                    placeholder="%"
                    accessibilityLabel={`${label}'s percentage`}
                  />
                </TextField>
              ) : null}
              {included && draft.splitMethod === 'fixed' ? (
                <TextField>
                  <Input
                    value={draft.fixedAmounts[member.userId] ?? ''}
                    onChangeText={(text) =>
                      setDraft((current) => ({
                        ...current,
                        fixedAmounts: { ...current.fixedAmounts, [member.userId]: text },
                      }))
                    }
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    accessibilityLabel={`${label}'s amount, in ${currency}`}
                  />
                </TextField>
              ) : null}
            </View>
          );
        })}
        {splitError ? <FieldError isInvalid>{splitError}</FieldError> : null}
      </Card.Body>
    </Card>
  );
}

function PreviewSection({ draft, result, members, currentUserId, currency }: ExpenseFormProps) {
  const nameOf = (userId: string) => {
    const member = members.find((item) => item.userId === userId);
    return member ? memberLabel(member, currentUserId) : 'Someone';
  };

  let content: string[];
  if (!draft.paidNow) {
    content = ['Nobody owes anything until someone pays this bill.'];
  } else if (!result.debts) {
    content = ['Enter the amount, who paid and the split to see who will owe whom.'];
  } else if (result.debts.length === 0) {
    content = ['Everyone paid their own share. Nobody will owe anything.'];
  } else {
    content = result.debts.map(
      (debt) =>
        `${nameOf(debt.debtorId)} will owe ${nameOf(debt.creditorId)} ${formatMinorUnits(debt.amountMinor)} ${currency}`,
    );
  }

  return (
    <Card>
      <Card.Body className="gap-2">
        <Card.Title>Preview</Card.Title>
        {content.map((line) => (
          <Typography.Paragraph key={line} type="body-sm">
            {line}
          </Typography.Paragraph>
        ))}
        <Typography.Paragraph type="body-xs" color="muted">
          Everyone included can object within the apartment&apos;s objection window. Until then the
          expense counts as provisional.
        </Typography.Paragraph>
      </Card.Body>
    </Card>
  );
}
