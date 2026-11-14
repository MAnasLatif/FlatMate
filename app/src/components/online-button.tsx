import { Button } from 'heroui-native';
import type { ComponentProps } from 'react';

import { useIsOnline } from '@/lib/network';

/**
 * A button for an action that writes to the server. It is disabled while the
 * device is offline, so nothing is sent later without the user seeing it
 * (decision 0007). Every screen's `FreshnessBanner` gives the reason.
 */
export function OnlineButton({ isDisabled, ...props }: ComponentProps<typeof Button>) {
  const isOnline = useIsOnline();
  return <Button {...props} isDisabled={isDisabled || !isOnline} />;
}
