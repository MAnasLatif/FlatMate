import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Chip, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { formatMoney } from '@/features/apartments/currencies';
import { useCategories, useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';

import { memberLabel } from '../member-label';
import { activeFilterCount, EXPENSE_STATUS_FILTERS, type ExpenseSearch } from '../search';

type ActiveFiltersProps = {
  apartmentId: string;
  currency: string;
  search: ExpenseSearch;
  onChange: (search: ExpenseSearch) => void;
  onOpen: () => void;
};

/**
 * The Filter button, with how many filters are on, and a chip for each one.
 * Tapping a chip removes that filter.
 */
export function ActiveFilters({
  apartmentId,
  currency,
  search,
  onChange,
  onOpen,
}: ActiveFiltersProps) {
  const userId = useCurrentUserId();
  const members = useMembers(apartmentId);
  const categories = useCategories(apartmentId);
  const [accent, muted] = useThemeColor(['accent', 'muted']);
  const count = activeFilterCount(search);

  const chips: { key: string; label: string; clear: Partial<ExpenseSearch> }[] = [];
  if (search.query.trim() !== '') {
    chips.push({ key: 'query', label: `“${search.query.trim()}”`, clear: { query: '' } });
  }
  if (search.memberId !== null) {
    const member = members.data?.find((item) => item.userId === search.memberId);
    chips.push({
      key: 'member',
      label: member ? memberLabel(member, userId) : 'Member',
      clear: { memberId: null },
    });
  }
  if (search.categoryId !== null) {
    const category = categories.data?.find((item) => item.id === search.categoryId);
    chips.push({
      key: 'category',
      label: category?.name ?? 'Category',
      clear: { categoryId: null },
    });
  }
  if (search.status !== null) {
    const status = EXPENSE_STATUS_FILTERS.find((item) => item.value === search.status);
    chips.push({ key: 'status', label: status?.label ?? 'Status', clear: { status: null } });
  }
  if (search.minMinor !== null || search.maxMinor !== null) {
    chips.push({
      key: 'amount',
      label: amountLabel(search.minMinor, search.maxMinor, currency),
      clear: { minMinor: null, maxMinor: null },
    });
  }

  return (
    <View className="flex-row flex-wrap items-center gap-x-2 gap-y-5">
      <Button
        size="sm"
        variant={count > 0 ? 'secondary' : 'ghost'}
        onPress={onOpen}
        accessibilityLabel={count > 0 ? `Filters, ${count} on` : 'Filter expenses'}
        hitSlop={8}
      >
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name="options-outline"
          size={18}
          color={count > 0 ? accent : muted}
        />
        <Button.Label>{count > 0 ? `Filters (${count})` : 'Filter'}</Button.Label>
      </Button>
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          variant="soft"
          color="accent"
          onPress={() => onChange({ ...search, ...chip.clear })}
          // As ChoiceChips: 28 dp drawn, 48 dp to touch.
          hitSlop={{ top: 10, bottom: 10 }}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter: ${chip.label}`}
        >
          <Chip.Label>{chip.label}</Chip.Label>
          <Ionicons name="close" size={14} color={accent} />
        </Chip>
      ))}
    </View>
  );
}

function amountLabel(minMinor: number | null, maxMinor: number | null, currency: string): string {
  if (minMinor !== null && maxMinor !== null) {
    return `${formatMoney(minMinor, currency)} – ${formatMoney(maxMinor, currency)}`;
  }
  if (minMinor !== null) return `From ${formatMoney(minMinor, currency)}`;
  return `Up to ${formatMoney(maxMinor ?? 0, currency)}`;
}
