import type { UseQueryResult } from '@tanstack/react-query';
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

/**
 * A small placeholder for one figure or image while it loads. Offline, a load
 * with nothing saved waits for the connection, so it says so instead.
 */
export function PendingSkeleton({
  className,
  accessibilityLabel,
  offlineText = 'Loads when online',
}: {
  className: string;
  accessibilityLabel: string;
  offlineText?: string;
}) {
  const isOnline = useIsOnline();
  if (!isOnline) {
    return (
      <Typography.Paragraph type="body-sm" color="muted">
        {offlineText}
      </Typography.Paragraph>
    );
  }
  return <Skeleton className={className} accessibilityLabel={accessibilityLabel} />;
}

/**
 * The error of the first query that has never loaded. A query whose refresh
 * failed still has its data, and the screen keeps showing it with
 * `FreshnessBanner` instead of replacing it with an error.
 */
export function loadingError(
  ...queries: Pick<UseQueryResult, 'isLoadingError' | 'error'>[]
): unknown {
  return queries.find((query) => query.isLoadingError)?.error ?? null;
}
