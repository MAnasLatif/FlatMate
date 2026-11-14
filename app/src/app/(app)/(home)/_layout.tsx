import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/tabs';
import { useThemeColor } from 'heroui-native';

import { TAB_ICON_BOX, TAB_ICON_SIZE, tabTransition } from '@/components/screen-transitions';
import { ProfileTabIcon } from '@/features/profile/components/profile-tab-icon';
import { SignOutButton } from '@/features/profile/components/sign-out-button';

/**
 * The bottom bar before joining an apartment: the same as inside one, without
 * the Add button, since there is nothing to add yet.
 */
export default function HomeTabsLayout() {
  const [accent, muted] = useThemeColor(['accent', 'muted']);

  return (
    <Tabs
      screenOptions={{
        ...tabTransition,
        tabBarShowLabel: false,
        headerShown: false,
        // No line above the bar.
        tabBarStyle: { borderTopWidth: 0, elevation: 0 },
        // Room for the icons, so none is cut off.
        tabBarIconStyle: { width: TAB_ICON_BOX, height: TAB_ICON_BOX },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Apartments',
          tabBarAccessibilityLabel: 'Apartments',
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name="receipt-outline"
              size={TAB_ICON_SIZE}
              color={focused ? accent : muted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Profile',
          headerShown: true,
          headerRight: () => <SignOutButton />,
          tabBarAccessibilityLabel: 'Profile',
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
      />
    </Tabs>
  );
}
