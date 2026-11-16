import { Description, FieldError, Input, Label, TextField } from 'heroui-native';
import type { Dispatch, SetStateAction } from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import type { Member } from '@/features/apartments/api';
import { SplitFields } from '@/features/expenses/components/split-fields';
import { memberLabel } from '@/features/expenses/member-label';
import { DateField } from '@/components/form/date-field';
import { addDays, addMonths, formatDate, monthStart } from '@/lib/time';

import type { RecurringKind } from '../api';
import { isMonthly, type Repeat } from '../schedule';
import {
  billDateIn,
  MAX_START_DAYS_AHEAD,
  nextFirstPeriod,
  type RecurringDraft,
  type RecurringResult,
} from '../draft';
import { currencySymbol } from '@/features/apartments/currencies';

const KIND_CHOICES: { value: RecurringKind; label: string }[] = [
  { value: 'fixed', label: 'Same amount each time' },
  { value: 'variable', label: 'Amount changes' },
];

const REPEAT_CHOICES: { value: Repeat; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'fortnightly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Every year' },
];

type TemplateFormProps = {
  draft: RecurringDraft;
  setDraft: Dispatch<SetStateAction<RecurringDraft>>;
  result: RecurringResult;
  showErrors: boolean;
  members: Member[];
  currentUserId: string;
  currency: string;
  today: string;
  /** Adding chooses the kind and the first charge; editing keeps them. */
  mode: 'add' | 'edit';
};

/** The fields of a repeatable expense: what it is, when it comes, who pays and how it is split. */
export function TemplateForm({
  draft,
  setDraft,
  result,
  showErrors,
  members,
  currentUserId,
  currency,
  today,
  mode,
}: TemplateFormProps) {
  const error = (field: keyof RecurringResult['errors']) =>
    showErrors ? result.errors[field] : undefined;
  const update = (patch: Partial<RecurringDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const isVariable = draft.kind === 'variable';
  const monthly = isMonthly(draft.repeat);

  const billDay = Number(draft.billDay);
  const validDay = Number.isInteger(billDay) && billDay >= 1 && billDay <= 31;
  // This month (even if its day has passed, which charges it at once) and the next two.
  const firstChoices = validDay
    ? [0, 1, 2].map((offset) => {
        const period = addMonths(monthStart(today), offset);
        const date = billDateIn(period, billDay);
        return {
          value: period,
          label: date < today ? `${formatDate(date)} (now)` : formatDate(date),
        };
      })
    : [];

  return (
    <View className="gap-5">
      {mode === 'add' ? (
        <View className="gap-2">
          <Label>Amount</Label>
          <ChoiceChips
            accessibilityLabel="Is the amount the same each time?"
            choices={KIND_CHOICES}
            selected={draft.kind}
            onSelect={(kind) =>
              update({
                kind,
                // A bill whose amount changes cannot be split by amount.
                splitMethod:
                  kind === 'variable' && draft.splitMethod === 'fixed'
                    ? 'equal'
                    : draft.splitMethod,
              })
            }
          />
          <Description>
            {isVariable
              ? 'Such as electricity or gas. On the bill day, admins are asked to enter the real amount; nothing is charged until they do.'
              : 'Such as rent or internet. It is added as a bill on its day, every time.'}
          </Description>
        </View>
      ) : null}

      <TextField isRequired isInvalid={error('title') !== undefined}>
        <Label>What is it for?</Label>
        <Input
          variant="secondary"
          value={draft.title}
          onChangeText={(title) => update({ title })}
          placeholder={isVariable ? 'Electricity, gas…' : 'Rent, internet…'}
          accessibilityLabel="What is it for?"
          testID="recurring-title"
        />
        <FieldError>{error('title')}</FieldError>
      </TextField>

      {isVariable ? null : (
        <TextField isRequired isInvalid={error('amount') !== undefined}>
          <Label>Amount ({currencySymbol(currency)})</Label>
          <Input
            variant="secondary"
            value={draft.amount}
            onChangeText={(amount) => update({ amount })}
            keyboardType="decimal-pad"
            placeholder="0.00"
            accessibilityLabel={`Amount in ${currency}`}
            testID="recurring-amount"
          />
          <FieldError>{error('amount')}</FieldError>
        </TextField>
      )}

      <View className="gap-2">
        <Label>Repeats</Label>
        <ChoiceChips
          accessibilityLabel="How often it repeats"
          choices={REPEAT_CHOICES}
          selected={draft.repeat}
          onSelect={(repeat) => update({ repeat })}
        />
        {monthly ? null : (
          <Description>
            {draft.repeat === 'daily'
              ? 'A charge is added every day from the first one.'
              : 'A charge is added on the same weekday as the first one.'}
          </Description>
        )}
      </View>

      {monthly ? (
        <TextField isRequired isInvalid={error('billDay') !== undefined}>
          <Label>{isVariable ? 'Day the bill arrives' : 'Day of the month it is added'}</Label>
          <Input
            variant="secondary"
            value={draft.billDay}
            onChangeText={(text) =>
              setDraft((current) => {
                const day = Number(text);
                return {
                  ...current,
                  billDay: text,
                  // The first charge follows the day, until the admin picks another month.
                  firstPeriod:
                    mode === 'add' && Number.isInteger(day) && day >= 1 && day <= 31
                      ? nextFirstPeriod(day, today)
                      : current.firstPeriod,
                };
              })
            }
            keyboardType="number-pad"
            maxLength={2}
            placeholder="1"
            accessibilityLabel="Day of the month, 1 to 31"
            testID="recurring-bill-day"
          />
          <Description>The 29th to 31st fall on the last day of shorter months.</Description>
          <FieldError>{error('billDay')}</FieldError>
        </TextField>
      ) : null}

      <TextField isInvalid={error('dueAfterDays') !== undefined}>
        <Label>Days to pay (optional)</Label>
        <Input
          variant="secondary"
          value={draft.dueAfterDays}
          onChangeText={(dueAfterDays) => update({ dueAfterDays })}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="None"
          accessibilityLabel="Days to pay after the bill day"
          testID="recurring-due-days"
        />
        <Description>
          The bill is due this many days after its day. Leave empty for no due date.
        </Description>
        <FieldError>{error('dueAfterDays')}</FieldError>
      </TextField>

      {mode === 'add' && !monthly ? (
        <DateField
          label={isVariable ? 'First bill' : 'First charge'}
          isRequired
          value={draft.startDate}
          onChange={(startDate) => update({ startDate })}
          today={today}
          minDate={today}
          maxDate={addDays(today, MAX_START_DAYS_AHEAD)}
          error={error('startDate')}
        />
      ) : null}

      {mode === 'add' && monthly && firstChoices.length > 0 ? (
        <View className="gap-2">
          <Label>{isVariable ? 'First bill' : 'First charge'}</Label>
          <ChoiceChips
            accessibilityLabel="When it starts"
            choices={firstChoices}
            selected={draft.firstPeriod}
            onSelect={(firstPeriod) => update({ firstPeriod })}
          />
          {draft.firstPeriod === monthStart(today) &&
          billDateIn(draft.firstPeriod, billDay) < today ? (
            <Description>This month&apos;s day has passed, so it starts right away.</Description>
          ) : null}
        </View>
      ) : null}

      <View className="gap-2">
        <Label>Who will pay it? (optional)</Label>
        <ChoiceChips
          accessibilityLabel="Who will pay the bill"
          choices={members.map((member) => ({
            value: member.userId,
            label: memberLabel(member, currentUserId),
          }))}
          selected={draft.collectorId}
          onSelect={(collectorId) =>
            update({ collectorId: collectorId === draft.collectorId ? null : collectorId })
          }
        />
        <Description>
          They are told each time. Nobody owes anything until a member pays the bill.
        </Description>
      </View>

      <SplitFields
        value={draft}
        onChange={update}
        shares={result.shares}
        error={showErrors || draft.splitMethod !== 'equal' ? result.errors.split : undefined}
        members={members}
        currentUserId={currentUserId}
        currency={currency}
        methods={isVariable ? ['equal', 'percentage'] : undefined}
      />
    </View>
  );
}
