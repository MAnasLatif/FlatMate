import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { PressableFeedback, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { tabTransition } from '@/components/screen-transitions';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { ApartmentSwitcher } from '@/features/apartments/components/apartment-switcher';
import { useApartmentId, useMyMembership } from '@/features/apartments/hooks';
import { ProfileTabIcon } from '@/features/profile/components/profile-tab-icon';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function ApartmentTabsLayout() {
  const apartmentId = useApartmentId();
  const [accent, muted] = useThemeColor(['accent', 'muted']);

  return (
    <Tabs
      screenOptions={{
        ...tabTransition,
        headerTitle: () => <ApartmentSwitcher apartmentId={apartmentId} />,
        headerTitleAlign: 'left',
        headerRight: () => <HeaderActions apartmentId={apartmentId} />,
        tabBarShowLabel: false,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: muted,
      }}
    >
      {/* SRS section 3.2 and AC-13: Expenses | Add | Profile. */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Expenses',
          tabBarAccessibilityLabel: 'Expenses',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="receipt-outline" focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarAccessibilityLabel: 'Add an expense',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="add-circle" focused={focused} size={size + 18} />
          ),
        }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.push({
              pathname: '/apartments/[apartmentId]/expenses/new',
              params: { apartmentId },
            });
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile',
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  name,
  focused,
  size,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  size: number;
}) {
  const [accent, muted] = useThemeColor(['accent', 'muted']);
  return <Ionicons name={name} size={size} color={focused ? accent : muted} />;
}

function HeaderActions({ apartmentId }: { apartmentId: string }) {
  const iconColor = useThemeColor('foreground');
  const membership = useMyMembership(apartmentId);
  const userId = useCurrentUserId();

  return (
    <View className="flex-row items-center gap-4 pr-4">
      <NotificationBell userId={userId} />
      <PressableFeedback
        onPress={() =>
          router.push({ pathname: '/apartments/[apartmentId]/members', params: { apartmentId } })
        }
        accessibilityRole="button"
        accessibilityLabel="Members"
        hitSlop={8}
      >
        <Ionicons name="people-outline" size={22} color={iconColor} />
      </PressableFeedback>
      {membership?.role === 'admin' ? (
        <PressableFeedback
          onPress={() =>
            router.push({ pathname: '/apartments/[apartmentId]/settings', params: { apartmentId } })
          }
          accessibilityRole="button"
          accessibilityLabel="Apartment settings"
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color={iconColor} />
        </PressableFeedback>
      ) : null}
    </View>
  );
}
