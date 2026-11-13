import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Menu, Typography, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { useApartment, useMyApartments } from '../hooks';

/**
 * The apartment name in the top bar. Tapping it lists the user's other
 * apartments to switch to (SRS section 3.1).
 */
export function ApartmentSwitcher({ apartmentId }: { apartmentId: string }) {
  const apartment = useApartment(apartmentId);
  const apartments = useMyApartments();
  const foregroundColor = useThemeColor('foreground');
  const name = apartment.data?.name ?? '';

  return (
    <Menu>
      <Menu.Trigger accessibilityRole="button" accessibilityLabel={`${name}. Switch apartment`}>
        <View className="flex-row items-center gap-1">
          <View>
            <Typography.Heading type="h5" numberOfLines={1}>
              {name}
            </Typography.Heading>
            {apartment.data?.show_location && apartment.data.location ? (
              <Typography.Paragraph type="body-xs" color="muted" numberOfLines={1}>
                {apartment.data.location}
              </Typography.Paragraph>
            ) : null}
          </View>
          <Ionicons name="chevron-down" size={16} color={foregroundColor} />
        </View>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Overlay />
        <Menu.Content presentation="popover" width={260}>
          {apartments.data?.map(({ apartment: item }) => (
            <Menu.Item
              key={item.id}
              onPress={() => {
                if (item.id !== apartmentId) {
                  router.replace({
                    pathname: '/apartments/[apartmentId]',
                    params: { apartmentId: item.id },
                  });
                }
              }}
            >
              <Menu.ItemTitle>{item.name}</Menu.ItemTitle>
              {item.id === apartmentId ? (
                <Ionicons name="checkmark" size={18} color={foregroundColor} />
              ) : null}
            </Menu.Item>
          ))}
          <Menu.Item onPress={() => router.dismissTo('/')}>
            <Menu.ItemTitle>All apartments</Menu.ItemTitle>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  );
}
