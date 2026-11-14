import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Description,
  FieldError,
  Input,
  InputGroup,
  Label,
  TextField,
  useThemeColor,
} from 'heroui-native';
import type { ComponentProps, ReactNode } from 'react';
import { type Control, type FieldPath, type FieldValues, useController } from 'react-hook-form';

export type TextInputFieldProps<TFieldValues extends FieldValues, TTransformed> = {
  control: Control<TFieldValues, unknown, TTransformed>;
  name: FieldPath<TFieldValues>;
  label: string;
  description?: string;
  isRequired?: boolean;
  /** A decorative icon at the start of the input, such as "mail-outline". */
  icon?: keyof typeof Ionicons.glyphMap;
  /**
   * Interactive content at the end of the input, such as a show-password
   * button. Pass null to hide it for now without rebuilding the input.
   */
  endContent?: ReactNode;
} & Omit<ComponentProps<typeof Input>, 'value' | 'onChangeText' | 'onBlur'>;

/** A labelled text input bound to a react-hook-form field, with its validation message. */
export function TextInputField<TFieldValues extends FieldValues, TTransformed>({
  control,
  name,
  label,
  description,
  isRequired,
  icon,
  endContent,
  ...inputProps
}: TextInputFieldProps<TFieldValues, TTransformed>) {
  const { field, fieldState } = useController({ control, name });
  const isInvalid = fieldState.error !== undefined;
  const iconColor = useThemeColor('muted');

  const fieldInputProps = {
    value: typeof field.value === 'string' ? field.value : '',
    onChangeText: field.onChange,
    onBlur: field.onBlur,
    accessibilityLabel: label,
    // A field that says what it holds (autoComplete) asks Android's autofill
    // service for saved emails, names and passwords, and for a suggested
    // password on a new one. The suggestions come from the device's chosen
    // autofill service, such as Google Password Manager.
    importantForAutofill:
      inputProps.autoComplete && inputProps.autoComplete !== 'off' ? ('yes' as const) : undefined,
    ...inputProps,
  };

  return (
    <TextField isRequired={isRequired} isInvalid={isInvalid}>
      <Label>{label}</Label>
      {/* endContent may be null while hidden: the group stays, so the input is
          not rebuilt (and does not lose focus) when the content appears. */}
      {icon !== undefined || endContent !== undefined ? (
        <InputGroup>
          {icon ? (
            <InputGroup.Prefix isDecorative>
              <Ionicons name={icon} size={18} color={iconColor} />
            </InputGroup.Prefix>
          ) : null}
          <InputGroup.Input {...fieldInputProps} />
          {endContent ? <InputGroup.Suffix>{endContent}</InputGroup.Suffix> : null}
        </InputGroup>
      ) : (
        <Input {...fieldInputProps} />
      )}
      {description && !isInvalid ? <Description>{description}</Description> : null}
      <FieldError>{fieldState.error?.message}</FieldError>
    </TextField>
  );
}
