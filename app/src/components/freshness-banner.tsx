import { useIsOnline } from '@/lib/network';
import { formatDateTime } from '@/lib/time';

import { FormAlert } from './form/form-alert';

/** What a screen tells the banner about its main query. */
export type Freshness = { dataUpdatedAt: number; isRefetchError: boolean };

/** The banner text, or null when the data on screen is current. */
export function freshnessMessage(
  isOnline: boolean,
  updatedAt: number | undefined,
  refreshFailed: boolean,
): string | null {
  const time = updatedAt ? formatDateTime(updatedAt) : null;
  if (!isOnline) {
    return time
      ? `You're offline. Last updated ${time}. Saving needs a connection.`
      : "You're offline. Saving needs a connection.";
  }
  if (refreshFailed && time) {
    return `Could not refresh. Showing what was loaded ${time}.`;
  }
  return null;
}

/**
 * Says when the data on screen may be out of date: offline, with when it was
 * last updated and that nothing can be saved, or online when a refresh failed
 * and saved data is still shown. Renders nothing otherwise.
 */
export function FreshnessBanner({ freshness }: { freshness?: Freshness }) {
  const isOnline = useIsOnline();
  const message = freshnessMessage(
    isOnline,
    freshness?.dataUpdatedAt,
    freshness?.isRefetchError ?? false,
  );
  return <FormAlert status="warning" message={message} />;
}
