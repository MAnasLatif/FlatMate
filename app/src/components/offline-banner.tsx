import { useIsOnline } from '@/lib/network';
import { formatDateTime } from '@/lib/time';

import { FormAlert } from './form/form-alert';

/** The banner text: offline, and how old the data on screen is when that is known. */
export function offlineMessage(updatedAt: number | undefined): string {
  if (!updatedAt) return "You're offline.";
  return `You're offline. Last updated ${formatDateTime(updatedAt)}.`;
}

/**
 * Says the device is offline and when the data on screen was last updated.
 * Renders nothing while online. `updatedAt` is a query's `dataUpdatedAt`,
 * which is 0 before the first successful load.
 */
export function OfflineBanner({ updatedAt }: { updatedAt?: number }) {
  const isOnline = useIsOnline();
  if (isOnline) return null;
  return <FormAlert status="warning" message={offlineMessage(updatedAt)} />;
}
