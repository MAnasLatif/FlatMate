import { router } from 'expo-router';
import { PressableFeedback, Typography } from 'heroui-native';
import { View } from 'react-native';

import { AppLogo } from '@/components/app-logo';
import { UnreadBadge, withUnread } from '@/features/notifications/components/unread-dot';
import { useUnreadCount } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';

import { useApartment, useMyApartments } from '../hooks';

/**
 * The top bar's title: FlatMate's logo and name, as on the home screen, with
 * the open apartment's name under it. Tapping it opens the list of the user's
 * apartments, where they pick another (SRS section 3.1). A red badge on the
 * logo counts what is new in their other apartments, and invitations back.
 */
export function ApartmentSwitcher({ apartmentId }: { apartmentId: string }) {
  const apartment = useApartment(apartmentId);
  const name = apartment.data?.name ?? '';
  const others = (useMyApartments().data ?? [])
    .map((item) => item.apartment.id)
    .filter((id) => id !== apartmentId);
  const inOthers = unreadMatches.inApartments(others);
  const invitedBack = unreadMatches.rejoinInvites();
  const unread = useUnreadCount((item) => inOthers(item) || invitedBack(item));

  return (
    <PressableFeedback
      onPress={() => router.push('/apartments')}
      accessibilityRole="button"
      accessibilityLabel={withUnread(`${name}. Switch apartment`, unread)}
      // The badge's box adds 6 points, so the logo and text are 10 apart.
      className="flex-row items-center gap-1"
    >
      <UnreadBadge count={unread}>
        {/* As tall as the two lines of text beside it, from the top of the
            name to the bottom of the apartment. */}
        <AppLogo markHeight={32} />
      </UnreadBadge>
      <View>
        <Typography.Heading type="h5" numberOfLines={1}>
          FlatMate
        </Typography.Heading>
        {/* Pulled up into the title's line spacing, so the two read as one block. */}
        <Typography.Paragraph type="body-xs" color="muted" numberOfLines={1} className="-mt-1">
          {name}
        </Typography.Paragraph>
      </View>
    </PressableFeedback>
  );
}
