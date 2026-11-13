import { Chip } from 'heroui-native';
import { View } from 'react-native';

export type Choice<T extends string> = { value: T; label: string };

type ChoiceChipsProps<T extends string> = {
  choices: readonly Choice<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
  accessibilityLabel: string;
};

/** A row of chips where one can be selected, such as a category or a payer. */
export function ChoiceChips<T extends string>({
  choices,
  selected,
  onSelect,
  accessibilityLabel,
}: ChoiceChipsProps<T>) {
  return (
    <View className="flex-row flex-wrap gap-2" accessibilityLabel={accessibilityLabel}>
      {choices.map((choice) => {
        const isSelected = choice.value === selected;
        return (
          <Chip
            key={choice.value}
            variant={isSelected ? 'primary' : 'soft'}
            color={isSelected ? 'accent' : 'default'}
            onPress={() => onSelect(choice.value)}
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
