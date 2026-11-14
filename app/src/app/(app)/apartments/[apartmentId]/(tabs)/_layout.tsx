import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { PressableFeedback, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { TAB_ICON_BOX, TAB_ICON_SIZE, tabTransition } from '@/components/screen-transitions';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { ApartmentSwitcher } from '@/features/apartments/components/apartment-switcher';
import { useApartmentId, useMyMembership } from '@/features/apartments/hooks';
import { ProfileTabIcon } from '@/features/profile/components/profile-tab-icon';
import { SignOutButton } from '@/features/profile/components/sign-out-button';

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
        // No line above the bar.
        tabBarStyle: { borderTopWidth: 0, elevation: 0 },
        // Room for the icons, so none is cut off.
        tabBarIconStyle: { width: TAB_ICON_BOX, height: TAB_ICON_BOX },
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
          tabBarIcon: ({ focused }) => (
            <TabIcon name="receipt-outline" focused={focused} size={TAB_ICON_SIZE} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarAccessibilityLabel: 'Add an expense',
          // The same size as the other icons, in the accent colour as the main action.
          tabBarIcon: () => <Ionicons name="add-circle" size={TAB_ICON_SIZE} color={accent} />,
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
          // The user's own page, not the apartment's: a plain title and sign-out.
          headerTitle: 'Profile',
          headerTitleAlign: 'left',
          headerRight: () => <SignOutButton />,
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
  return <Ionicons name={name} size={TAB_ICON_SIZE} color={focused ? accent : muted} />;
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
