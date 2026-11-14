import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/tabs';
import { useThemeColor } from 'heroui-native';

import { tabTransition } from '@/components/screen-transitions';
import { ProfileTabIcon } from '@/features/profile/components/profile-tab-icon';
import { SignOutButton } from '@/features/profile/components/sign-out-button';

/**
 * The bottom bar before joining an apartment: the same as inside one, without
 * the Add button, since there is nothing to add yet.
 */
export default function HomeTabsLayout() {
  const [accent, muted] = useThemeColor(['accent', 'muted']);

  return (
    <Tabs screenOptions={{ ...tabTransition, tabBarShowLabel: false, headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Apartments',
          tabBarAccessibilityLabel: 'Apartments',
          tabBarIcon: ({ focused, size }) => (
            <Ionicons name="receipt-outline" size={size} color={focused ? accent : muted} />
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
