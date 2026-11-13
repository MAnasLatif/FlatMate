import { FieldError, InputOTP, Label, TextField } from 'heroui-native';

import { EMAIL_CODE_LENGTH } from '../schemas';

type EmailCodeFieldProps = {
  value: string;
  onChange: (code: string) => void;
  error?: string;
};

/** The 6-digit code from a confirmation or password reset email. */
export function EmailCodeField({ value, onChange, error }: EmailCodeFieldProps) {
  return (
    <TextField isInvalid={error !== undefined}>
      <Label>Code from the email</Label>
      <InputOTP
        maxLength={EMAIL_CODE_LENGTH}
        value={value}
        onChange={onChange}
        inputMode="numeric"
        isInvalid={error !== undefined}
        textInputProps={{
          textContentType: 'oneTimeCode',
          autoComplete: 'one-time-code',
          accessibilityLabel: 'Code from the email',
        }}
      >
        <InputOTP.Group>
          {({ slots }) => (
            <>
              {slots.map((slot) => (
                <InputOTP.Slot key={slot.index} index={slot.index} />
              ))}
            </>
          )}
        </InputOTP.Group>
      </InputOTP>
      <FieldError>{error}</FieldError>
    </TextField>
  );
}
