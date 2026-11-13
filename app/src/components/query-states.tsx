import { Button, Skeleton, Typography } from 'heroui-native';
import { View } from 'react-native';

import { useIsOnline } from '@/lib/network';

import { FormAlert } from './form/form-alert';

/**
 * Placeholder rows shown while a list loads, sized like the real rows. Offline,
 * a load that has nothing saved waits for the connection instead of failing,
 * so the rows say so rather than loading forever.
 */
export function LoadingRows({ count = 3 }: { count?: number }) {
  const isOnline = useIsOnline();
  if (!isOnline) {
    return (
      <Typography.Paragraph type="body-sm" color="muted" className="py-6 text-center">
        {"This will load when you're back online."}
      </Typography.Paragraph>
    );
  }
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
