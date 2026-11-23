import { Chip } from 'heroui-native';
import { View } from 'react-native';

export type Choice<T extends string> = { value: T; label: string };

type ChoiceChipsProps<T extends string> = {
  choices: readonly Choice<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
  accessibilityLabel: string;
};

/**
 * A row of chips where one can be selected, such as a category or a payer.
 * Chips are drawn 28 dp high but answer touches over 48 dp: rows are 20 dp
 * apart, so each chip reaches 10 dp up and down without overlapping the next.
 */
const CHIP_HIT_SLOP = { top: 10, bottom: 10 };

export function ChoiceChips<T extends string>({
  choices,
  selected,
  onSelect,
  accessibilityLabel,
}: ChoiceChipsProps<T>) {
  return (
    <View className="flex-row flex-wrap gap-x-2 gap-y-5" accessibilityLabel={accessibilityLabel}>
      {choices.map((choice) => {
        const isSelected = choice.value === selected;
        return (
          <Chip
            key={choice.value}
            variant={isSelected ? 'primary' : 'soft'}
            color={isSelected ? 'accent' : 'default'}
            onPress={() => onSelect(choice.value)}
            hitSlop={CHIP_HIT_SLOP}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
          >
            {choice.label}
          </Chip>
        );
      })}
    </View>
  );
}
