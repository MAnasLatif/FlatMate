import { Alert } from 'heroui-native';

type FormAlertProps = {
  message: string | null | undefined;
  status?: 'danger' | 'success' | 'warning';
};

/** A form-level message, such as a failed submission. Renders nothing without a message. */
export function FormAlert({ message, status = 'danger' }: FormAlertProps) {
  if (!message) {
    return null;
  }
  return (
    <Alert status={status}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
