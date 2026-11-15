import { router } from 'expo-router';
import { PressableFeedback, Typography } from 'heroui-native';
import { View } from 'react-native';

import { AppLogo } from '@/components/app-logo';
import { UnreadDot, withUnread } from '@/features/notifications/components/unread-dot';
import { useHasUnread } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';

import { useApartment, useMyApartments } from '../hooks';

/**
 * The top bar's title: FlatMate's logo and name, as on the home screen, with
 * the open apartment's name under it. Tapping it opens the list of the user's
 * apartments, where they pick another (SRS section 3.1). A red dot on the
 * logo means another of their apartments has something new.
 */
export function ApartmentSwitcher({ apartmentId }: { apartmentId: string }) {
  const apartment = useApartment(apartmentId);
  const name = apartment.data?.name ?? '';
  const others = (useMyApartments().data ?? [])
    .map((item) => item.apartment.id)
    .filter((id) => id !== apartmentId);
  const unread = useHasUnread(unreadMatches.inApartments(others));

  return (
    <PressableFeedback
      onPress={() => router.push('/apartments')}
      accessibilityRole="button"
      accessibilityLabel={withUnread(`${name}. Switch apartment`, unread)}
      className="flex-row items-center gap-2"
    >
      <View>
        <AppLogo size={44} />
        {unread ? <UnreadDot overlay /> : null}
      </View>
      <View>
        <Typography.Heading type="h5" numberOfLines={1}>
          FlatMate
        </Typography.Heading>
        <Typography.Paragraph type="body-xs" color="muted" numberOfLines={1}>
          {name}
        </Typography.Paragraph>
      </View>
    </PressableFeedback>
  );
}
