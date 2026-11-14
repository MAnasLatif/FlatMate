import Ionicons from '@expo/vector-icons/Ionicons';
import { PressableFeedback, useThemeColor } from 'heroui-native';
import { useState } from 'react';
import type { FieldValues } from 'react-hook-form';

import { TextInputField, type TextInputFieldProps } from './text-input-field';

type PasswordFieldProps<TFieldValues extends FieldValues, TTransformed> = Omit<
  TextInputFieldProps<TFieldValues, TTransformed>,
  'secureTextEntry' | 'icon' | 'endContent' | 'autoComplete' | 'textContentType'
> & {
  /**
   * "new" for choosing a password (sign-up, reset, change), so the device's
   * password manager offers a strong one and saves it; "current" for signing in.
   */
  purpose: 'new' | 'current';
};

/** A password input with a button to show or hide what has been typed. */
export function PasswordField<TFieldValues extends FieldValues, TTransformed>({
  purpose,
  ...props
}: PasswordFieldProps<TFieldValues, TTransformed>) {
  const [isVisible, setVisible] = useState(false);
  const iconColor = useThemeColor('muted');

  return (
    <TextInputField
      {...props}
      icon="lock-closed-outline"
      secureTextEntry={!isVisible}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={purpose === 'new' ? 'new-password' : 'current-password'}
      textContentType={purpose === 'new' ? 'newPassword' : 'password'}
      endContent={
        <PressableFeedback
          onPress={() => setVisible((visible) => !visible)}
          accessibilityRole="button"
          accessibilityLabel={isVisible ? 'Hide password' : 'Show password'}
          hitSlop={12}
        >
          <Ionicons
            name={isVisible ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={iconColor}
          />
        </PressableFeedback>
      }
    />
  );
}
