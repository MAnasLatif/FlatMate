import { router } from 'expo-router';
import { PressableFeedback, Typography } from 'heroui-native';
import { View } from 'react-native';

import { AppLogo } from '@/components/app-logo';

import { useApartment } from '../hooks';

/**
 * The top bar's title: FlatMate's logo and name, as on the home screen, with
 * the open apartment's name under it. Tapping it opens the list of the user's
 * apartments, where they pick another (SRS section 3.1).
 */
export function ApartmentSwitcher({ apartmentId }: { apartmentId: string }) {
  const apartment = useApartment(apartmentId);
  const name = apartment.data?.name ?? '';

  return (
    <PressableFeedback
      onPress={() => router.push('/apartments')}
      accessibilityRole="button"
      accessibilityLabel={`${name}. Switch apartment`}
      className="flex-row items-center gap-2"
    >
      <AppLogo size={44} />
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
