import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { PressableFeedback, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import {
  HEADER_ICON_SIZE,
  TAB_ICON_BOX,
  TAB_ICON_SIZES,
  tabTransition,
} from '@/components/screen-transitions';
import { ApartmentSwitcher } from '@/features/apartments/components/apartment-switcher';
import { useApartmentId } from '@/features/apartments/hooks';
import { UnreadBadge, withUnread } from '@/features/notifications/components/unread-dot';
import { useUnreadCount } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { HeaderBack } from '@/components/header-back';
import { ProfileTabIcon } from '@/features/profile/components/profile-tab-icon';
import { SignOutButton } from '@/features/profile/components/sign-out-button';

export const unstable_settings = {
  anchor: 'index',
};

export default function ApartmentTabsLayout() {
  const apartmentId = useApartmentId();
  const [accent, muted] = useThemeColor(['accent', 'muted']);

  return (
    <Tabs
      // Back from another tab returns to the expenses.
      backBehavior="initialRoute"
      screenOptions={{
        ...tabTransition,
        headerTitle: () => <ApartmentSwitcher apartmentId={apartmentId} />,
        headerTitleAlign: 'left',
        headerRight: () => <HeaderActions apartmentId={apartmentId} />,
        // No line under the header; the dashboard shows it once its list scrolls.
        headerShadowVisible: false,
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
            <TabIcon name="receipt-outline" focused={focused} size={TAB_ICON_SIZES.expenses} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarAccessibilityLabel: 'Add an expense',
          // Grey like the other icons: blue marks only the open tab.
          tabBarIcon: () => <Ionicons name="add-circle" size={TAB_ICON_SIZES.add} color={muted} />,
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
          // The user's own page, not the apartment's: a plain title, back to the
          // expenses, and sign-out.
          headerTitle: 'Profile',
          headerLeft: () => (
            <HeaderBack
              onPress={() =>
                router.navigate({ pathname: '/apartments/[apartmentId]', params: { apartmentId } })
              }
            />
          ),
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
  return <Ionicons name={name} size={size} color={focused ? accent : muted} />;
}

function HeaderActions({ apartmentId }: { apartmentId: string }) {
  const iconColor = useThemeColor('foreground');
  // Joins, exits, requests to join and the settlement (payments, offsets,
  // closed periods) are reached from the members screen, so their count is here.
  const unread =
    useUnreadCount(unreadMatches.members(apartmentId)) +
    useUnreadCount(unreadMatches.settlement(apartmentId));

  return (
    <View className="flex-row items-center gap-4 pr-4">
      <PressableFeedback
        onPress={() =>
          router.push({ pathname: '/apartments/[apartmentId]/members', params: { apartmentId } })
        }
        accessibilityRole="button"
        accessibilityLabel={withUnread('Members', unread)}
        hitSlop={8}
      >
        <UnreadBadge count={unread}>
          <Ionicons name="people-outline" size={HEADER_ICON_SIZE} color={iconColor} />
        </UnreadBadge>
      </PressableFeedback>
    </View>
  );
}
