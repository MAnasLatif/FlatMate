import {
  BottomSheet,
  Button,
  FieldError,
  Input,
  Label,
  TextField,
  Typography,
} from 'heroui-native';
import { type ReactNode, type RefObject, useRef, useState } from 'react';
import { ScrollView, type ScrollViewInstance, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Sheet } from '@/components/sheet';
import { currencySymbol } from '@/features/apartments/currencies';
import { useCategories, useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { userErrorMessage } from '@/lib/errors';
import { minorUnitsToInput } from '@/lib/money';

import { memberLabel } from '../member-label';
import {
  EXPENSE_STATUS_FILTERS,
  type ExpenseSearch,
  type ExpenseStatusFilter,
  MAX_QUERY_LENGTH,
  NO_SEARCH,
  parseAmountRange,
} from '../search';

type ExpenseFilterSheetProps = {
  apartmentId: string;
  currency: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  search: ExpenseSearch;
  onApply: (search: ExpenseSearch) => void;
};

/**
 * Search and filters for the month's expenses, in a drawer. Nothing changes
 * until Show expenses is pressed; Clear all removes every filter at once.
 */
export function ExpenseFilterSheet({
  apartmentId,
  currency,
  isOpen,
  onOpenChange,
  search,
  onApply,
}: ExpenseFilterSheetProps) {
  const userId = useCurrentUserId();
  const scrollRef = useRef<ScrollViewInstance>(null);

  // The form mounts with each opening, so it starts from the filters in use.
  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      detents={[0.85]}
      scrollableRef={scrollRef}
      style={{ flex: 1 }}
    >
      <BottomSheet.Content className="flex-1">
        <FilterForm
          apartmentId={apartmentId}
          userId={userId}
          currency={currency}
          search={search}
          scrollRef={scrollRef}
          onApply={(next) => {
            onApply(next);
            onOpenChange(false);
          }}
        />
      </BottomSheet.Content>
    </Sheet>
  );
}

function FilterForm({
  apartmentId,
  userId,
  currency,
  search,
  scrollRef,
  onApply,
}: {
  apartmentId: string;
  userId: string;
  currency: string;
  search: ExpenseSearch;
  /** The sheet coordinates its drag and the keyboard with this scroll view. */
  scrollRef: RefObject<ScrollViewInstance | null>;
  onApply: (search: ExpenseSearch) => void;
}) {
  const members = useMembers(apartmentId);
  const categories = useCategories(apartmentId);

  const [query, setQuery] = useState(search.query);
  const [memberId, setMemberId] = useState(search.memberId);
  const [categoryId, setCategoryId] = useState(search.categoryId);
  const [status, setStatus] = useState(search.status);
  const [minText, setMinText] = useState(
    search.minMinor === null ? '' : minorUnitsToInput(search.minMinor),
  );
  const [maxText, setMaxText] = useState(
    search.maxMinor === null ? '' : minorUnitsToInput(search.maxMinor),
  );
  const [amountError, setAmountError] = useState<string>();

  // Tapping the chosen chip again turns that filter off.
  const toggle =
    <T extends string>(current: T | null, set: (value: T | null) => void) =>
    (value: T) =>
      set(current === value ? null : value);

  const apply = () => {
    const range = parseAmountRange({ min: minText, max: maxText });
    if (!range.ok) {
      setAmountError(range.error);
      return;
    }
    onApply({
      query: query.trim(),
      memberId,
      categoryId,
      status,
      minMinor: range.minMinor,
      maxMinor: range.maxMinor,
    });
  };

  const symbol = currencySymbol(currency);

  return (
    <View className="flex-1 gap-4">
      <BottomSheet.Title>Filter expenses</BottomSheet.Title>
      <ScrollView
        ref={scrollRef}
        contentContainerClassName="gap-5 pb-4"
        keyboardShouldPersistTaps="handled"
      >
        <TextField>
          <Label>Search</Label>
          <Input
            variant="secondary"
            value={query}
            onChangeText={setQuery}
            maxLength={MAX_QUERY_LENGTH}
            placeholder="Title or notes"
            returnKeyType="search"
            onSubmitEditing={apply}
            autoCorrect={false}
            accessibilityLabel="Search expenses"
          />
        </TextField>

        <FilterGroup title="Member">
          {members.isPending ? (
            <LoadingRows count={1} />
          ) : members.isLoadingError ? (
            <LoadError
              message={userErrorMessage(members.error, 'Could not load the members.')}
              onRetry={() => void members.refetch()}
            />
          ) : (
            <ChoiceChips
              accessibilityLabel="Member"
              choices={members.data.map((member) => ({
                value: member.userId,
                label: memberLabel(member, userId) + (member.leftAt === null ? '' : ' (left)'),
              }))}
              selected={memberId}
              onSelect={toggle(memberId, setMemberId)}
            />
          )}
          <Typography.Paragraph type="body-xs" color="muted">
            Expenses they share in or paid for.
          </Typography.Paragraph>
        </FilterGroup>

        <FilterGroup title="Category">
          {categories.isPending ? (
            <LoadingRows count={1} />
          ) : categories.isLoadingError ? (
            <LoadError
              message={userErrorMessage(categories.error, 'Could not load the categories.')}
              onRetry={() => void categories.refetch()}
            />
          ) : (
            <ChoiceChips
              accessibilityLabel="Category"
              choices={categories.data.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              selected={categoryId}
              onSelect={toggle(categoryId, setCategoryId)}
            />
          )}
        </FilterGroup>

        <FilterGroup title="Status">
          <ChoiceChips<ExpenseStatusFilter>
            accessibilityLabel="Status"
            choices={EXPENSE_STATUS_FILTERS}
            selected={status}
            onSelect={toggle(status, setStatus)}
          />
        </FilterGroup>

        <FilterGroup title="Amount">
          <View className="flex-row gap-3">
            <TextField className="flex-1" isInvalid={amountError !== undefined}>
              <Label>{`From (${symbol})`}</Label>
              <Input
                variant="secondary"
                value={minText}
                onChangeText={(value) => {
                  setMinText(value);
                  setAmountError(undefined);
                }}
                keyboardType="decimal-pad"
                placeholder="Any"
                accessibilityLabel="Lowest amount"
              />
            </TextField>
            <TextField className="flex-1" isInvalid={amountError !== undefined}>
              <Label>{`To (${symbol})`}</Label>
              <Input
                variant="secondary"
                value={maxText}
                onChangeText={(value) => {
                  setMaxText(value);
                  setAmountError(undefined);
                }}
                keyboardType="decimal-pad"
                placeholder="Any"
                accessibilityLabel="Highest amount"
              />
            </TextField>
          </View>
          <TextField isInvalid={amountError !== undefined}>
            <FieldError>{amountError}</FieldError>
          </TextField>
        </FilterGroup>
      </ScrollView>

      <View className="flex-row gap-3 pb-2">
        <Button variant="secondary" className="flex-1" onPress={() => onApply(NO_SEARCH)}>
          Clear all
        </Button>
        <Button className="flex-1" onPress={apply}>
          Show expenses
        </Button>
      </View>
    </View>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Typography.Heading type="h6">{title}</Typography.Heading>
      {children}
    </View>
  );
}
