import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { PressableFeedback, Typography, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { HEADER_ICON_SIZE } from '@/components/screen-transitions';

import { useUnreadCount } from '../hooks';

/** Opens the inbox, with how many notifications are unread. */
export function NotificationBell({ userId }: { userId: string }) {
  const iconColor = useThemeColor('foreground');
  const unread = useUnreadCount(userId).data ?? 0;
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <PressableFeedback
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
    >
      <Ionicons name="notifications-outline" size={HEADER_ICON_SIZE} color={iconColor} />
      {unread > 0 ? (
        <View className="absolute -right-2 -top-1 min-w-4 items-center rounded-full bg-accent px-1">
          <Typography.Paragraph type="body-xs" className="text-accent-foreground">
            {unread > 99 ? '99+' : String(unread)}
          </Typography.Paragraph>
        </View>
      ) : null}
    </PressableFeedback>
  );
}
