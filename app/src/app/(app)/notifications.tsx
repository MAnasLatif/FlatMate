import { useCurrentUserId } from '@/features/auth/session-provider';
import { Inbox } from '@/features/notifications/components/inbox';

export default function NotificationsScreen() {
  return <Inbox userId={useCurrentUserId()} />;
}
