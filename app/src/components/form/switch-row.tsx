import { ControlField, Description, Label } from 'heroui-native';
import { View } from 'react-native';

type SwitchRowProps = {
  label: string;
  description?: string;
  isSelected: boolean;
  onSelectedChange: (isSelected: boolean) => void;
  isDisabled?: boolean;
};

/**
 * An on/off row: a label, an optional description and a switch, pressable as
 * a whole. HeroUI's ControlField reaches screen readers as three items, with
 * the switch read only as "on" or "off". Here the row is the one switch, named
 * by its label, and the parts inside are hidden from screen readers.
 */
export function SwitchRow({
  label,
  description,
  isSelected,
  onSelectedChange,
  isDisabled = false,
}: SwitchRowProps) {
  return (
    <ControlField
      isSelected={isSelected}
      onSelectedChange={onSelectedChange}
      isDisabled={isDisabled}
      className="min-h-12"
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: isSelected, disabled: isDisabled }}
    >
      {/* Kept as real views: a flattened wrapper would lose the hiding. */}
      <View
        className="flex-1"
        collapsable={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Label>{label}</Label>
        {description ? <Description>{description}</Description> : null}
      </View>
      <ControlField.Indicator
        collapsable={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    </ControlField>
  );
}
