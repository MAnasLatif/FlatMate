import { ControlField, Description, Label } from 'heroui-native';
import { View } from 'react-native';
import { type Control, type FieldPath, type FieldValues, useController } from 'react-hook-form';

type SwitchFieldProps<TFieldValues extends FieldValues, TTransformed> = {
  control: Control<TFieldValues, unknown, TTransformed>;
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
};

/** An on/off setting bound to a react-hook-form boolean field. */
export function SwitchField<TFieldValues extends FieldValues, TTransformed>({
  control,
  name,
  label,
  description,
}: SwitchFieldProps<TFieldValues, TTransformed>) {
  const { field } = useController({ control, name });

  return (
    <ControlField isSelected={field.value === true} onSelectedChange={field.onChange}>
      <View className="flex-1">
        <Label>{label}</Label>
        {description ? <Description>{description}</Description> : null}
      </View>
      <ControlField.Indicator />
    </ControlField>
  );
}
