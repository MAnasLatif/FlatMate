import { Button, Skeleton } from 'heroui-native';
import { View } from 'react-native';

import { FormAlert } from './form/form-alert';

/** Placeholder rows shown while a list loads, sized like the real rows. */
export function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <View className="gap-3" accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-16 rounded-xl" />
      ))}
    </View>
  );
}

/** A failed load with a way to try again. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="gap-3">
      <FormAlert message={message} />
      <Button variant="secondary" onPress={onRetry}>
        Try again
      </Button>
    </View>
  );
}
