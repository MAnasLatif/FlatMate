import { Description, FieldError, Input, Label, TextField } from 'heroui-native';
import type { ComponentProps } from 'react';
import { type Control, type FieldPath, type FieldValues, useController } from 'react-hook-form';

type TextInputFieldProps<TFieldValues extends FieldValues, TTransformed> = {
  control: Control<TFieldValues, unknown, TTransformed>;
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
  isRequired?: boolean;
} & Omit<ComponentProps<typeof Input>, 'value' | 'onChangeText' | 'onBlur'>;

/** A labelled text input bound to a react-hook-form field, with its validation message. */
export function TextInputField<TFieldValues extends FieldValues, TTransformed>({
  control,
  name,
  label,
  description,
  isRequired,
  ...inputProps
}: TextInputFieldProps<TFieldValues, TTransformed>) {
  const { field, fieldState } = useController({ control, name });
  const isInvalid = fieldState.error !== undefined;

  return (
    <TextField isRequired={isRequired} isInvalid={isInvalid}>
      <Label>{label}</Label>
      <Input
        value={typeof field.value === 'string' ? field.value : ''}
        onChangeText={field.onChange}
        onBlur={field.onBlur}
        accessibilityLabel={label}
        {...inputProps}
      />
      {description && !isInvalid ? <Description>{description}</Description> : null}
      <FieldError>{fieldState.error?.message}</FieldError>
    </TextField>
  );
}
