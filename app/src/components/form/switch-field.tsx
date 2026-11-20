import { type Control, type FieldPath, type FieldValues, useController } from 'react-hook-form';

import { SwitchRow } from './switch-row';

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
    <SwitchRow
      label={label}
      description={description}
      isSelected={field.value === true}
      onSelectedChange={field.onChange}
    />
  );
}
