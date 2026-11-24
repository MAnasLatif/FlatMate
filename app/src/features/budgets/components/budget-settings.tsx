import {
  BottomSheet,
  Button,
  Card,
  FieldError,
  Input,
  Label,
  PressableFeedback,
  TextField,
  Typography,
  useBottomSheetAwareHandlers,
} from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, loadingError, LoadingRows } from '@/components/query-states';
import { currencySymbol, formatMoney } from '@/features/apartments/currencies';
import { useCategories } from '@/features/apartments/hooks';
import { MAX_AMOUNT_MINOR } from '@/features/expenses/split';
import { userErrorMessage } from '@/lib/errors';
import { minorUnitsToInput, parseAmountToMinorUnits } from '@/lib/money';
import { monthStart, todayInTimeZone } from '@/lib/time';

import type { Budget } from '../api';
import { BUDGET_ERROR_MESSAGES } from '../errors';
import { useBudgetActions, useBudgets } from '../hooks';

type BudgetTarget = { categoryId: string | null; name: string; budget: Budget | undefined };

/**
 * Monthly budgets, for admins (FR-10.3): one for all spending and one for
 * any category. Tapping a row sets, changes or removes its budget.
 */
export function BudgetSettings({
  apartmentId,
  currency,
  timezone,
}: {
  apartmentId: string;
  currency: string;
  timezone: string;
}) {
  const month = monthStart(todayInTimeZone(timezone));
  const budgets = useBudgets(apartmentId, month);
  const categories = useCategories(apartmentId);
  const [editing, setEditing] = useState<BudgetTarget | null>(null);
  const [isSheetOpen, setSheetOpen] = useState(false);

  const header = (
    <>
      <Typography.Heading type="h6">Monthly budgets</Typography.Heading>
      <Typography.Paragraph type="body-xs" color="muted">
        Everyone sees how each month&apos;s spending compares, and is told when it reaches 80% and
        100% of a budget. Bills not paid yet count; cancelled expenses do not.
      </Typography.Paragraph>
    </>
  );

  if (budgets.isPending || categories.isPending) {
    return (
      <View className="gap-3">
        {header}
        <LoadingRows count={2} />
      </View>
    );
  }
  const loadError = loadingError(budgets, categories);
  if (loadError || !budgets.data || !categories.data) {
    return (
      <View className="gap-3">
        {header}
        <LoadError
          message={userErrorMessage(loadError, 'Could not load the budgets.')}
          onRetry={() => {
            void budgets.refetch();
            void categories.refetch();
          }}
        />
      </View>
    );
  }

  const byCategory = new Map(budgets.data.map((budget) => [budget.categoryId, budget]));
  const targets: BudgetTarget[] = [
    { categoryId: null, name: 'All spending', budget: byCategory.get(null) },
    ...categories.data.map((category) => ({
      categoryId: category.id,
      name: category.name,
      budget: byCategory.get(category.id),
    })),
  ];

  return (
    <View className="gap-3">
      {header}
      {targets.map((target) => {
        const value = target.budget
          ? `${formatMoney(target.budget.limitMinor, currency)} a month`
          : 'No budget';
        return (
          <PressableFeedback
            key={target.categoryId ?? 'all'}
            onPress={() => {
              setEditing(target);
              setSheetOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${target.name}: ${value}`}
            accessibilityHint="Opens it to set the budget"
            className="rounded-3xl"
          >
            <Card>
              <Card.Body className="flex-row items-center gap-2">
                <Typography.Paragraph numberOfLines={1} className="flex-1">
                  {target.name}
                </Typography.Paragraph>
                <Typography.Paragraph type="body-sm" color={target.budget ? undefined : 'muted'}>
                  {value}
                </Typography.Paragraph>
              </Card.Body>
            </Card>
          </PressableFeedback>
        );
      })}
      <BudgetSheet
        apartmentId={apartmentId}
        currency={currency}
        isOpen={isSheetOpen}
        onOpenChange={setSheetOpen}
        target={editing}
      />
    </View>
  );
}

function BudgetSheet({
  apartmentId,
  currency,
  isOpen,
  onOpenChange,
  target,
}: {
  apartmentId: string;
  currency: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  target: BudgetTarget | null;
}) {
  // Each opening starts a fresh form.
  const [openCount, setOpenCount] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setOpenCount((count) => count + 1);
  }

  return (
    // Always mounted: a sheet mounted already open does not appear.
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content keyboardBehavior="interactive" keyboardBlurBehavior="restore">
          {target ? (
            <BudgetForm
              key={`${openCount}-${target.categoryId ?? 'all'}`}
              apartmentId={apartmentId}
              currency={currency}
              target={target}
              onDone={() => onOpenChange(false)}
            />
          ) : null}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function BudgetForm({
  apartmentId,
  currency,
  target,
  onDone,
}: {
  apartmentId: string;
  currency: string;
  target: BudgetTarget;
  onDone: () => void;
}) {
  const { set, remove } = useBudgetActions(apartmentId);
  const { onFocus, onBlur } = useBottomSheetAwareHandlers();
  const [amount, setAmount] = useState(
    target.budget ? minorUnitsToInput(target.budget.limitMinor) : '',
  );
  const [amountError, setAmountError] = useState<string>();
  const isBusy = set.isPending || remove.isPending;
  const failed = set.error ?? remove.error;

  const save = () => {
    const limitMinor = parseAmountToMinorUnits(amount);
    if (limitMinor === null || limitMinor === 0) {
      setAmountError('Enter a monthly budget greater than zero, such as 25000.');
      return;
    }
    if (limitMinor > MAX_AMOUNT_MINOR) {
      setAmountError('This amount is too large.');
      return;
    }
    setAmountError(undefined);
    set.mutate({ categoryId: target.categoryId, limitMinor }, { onSuccess: onDone });
  };

  return (
    <View className="gap-5">
      <BottomSheet.Title>{target.name}</BottomSheet.Title>
      <TextField isRequired isInvalid={amountError !== undefined}>
        <Label>Monthly budget ({currencySymbol(currency)})</Label>
        {/* The grey field reads better than the white one on the white sheet. */}
        <Input
          variant="secondary"
          value={amount}
          onChangeText={(value) => {
            setAmount(value);
            setAmountError(undefined);
            set.reset();
          }}
          onFocus={onFocus}
          onBlur={onBlur}
          autoFocus
          keyboardType="decimal-pad"
          placeholder="0.00"
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel={`Monthly budget in ${currency}`}
        />
        <FieldError>{amountError}</FieldError>
      </TextField>
      <FormAlert
        message={
          failed
            ? userErrorMessage(failed, 'Could not save the budget.', BUDGET_ERROR_MESSAGES)
            : null
        }
      />
      <OnlineButton onPress={save} isDisabled={isBusy}>
        {set.isPending ? 'Saving…' : 'Save budget'}
      </OnlineButton>
      {target.budget ? (
        <OnlineButton
          variant="danger-soft"
          onPress={() => remove.mutate(target.categoryId, { onSuccess: onDone })}
          isDisabled={isBusy}
        >
          {remove.isPending ? 'Removing…' : 'Remove budget'}
        </OnlineButton>
      ) : (
        <Button variant="ghost" onPress={onDone} isDisabled={isBusy}>
          Cancel
        </Button>
      )}
    </View>
  );
}
