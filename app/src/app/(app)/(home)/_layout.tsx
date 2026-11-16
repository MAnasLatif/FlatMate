import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { Typography, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { AppLogo } from '@/components/app-logo';

import { TAB_ICON_BOX, TAB_ICON_SIZES, tabTransition } from '@/components/screen-transitions';
import { HeaderBack } from '@/components/header-back';
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
          // A fixed top bar, as inside an apartment, so it stays while the page scrolls.
          headerShown: true,
          headerTitle: () => <HomeTitle />,
          headerTitleAlign: 'left',
          tabBarAccessibilityLabel: 'Apartments',
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name="receipt-outline"
              size={TAB_ICON_SIZES.expenses}
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
          headerLeft: () => <HeaderBack onPress={() => router.navigate('/')} />,
          headerRight: () => <SignOutButton />,
          tabBarAccessibilityLabel: 'Profile',
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
      />
    </Tabs>
  );
}

function HomeTitle() {
  return (
    <View className="flex-row items-center gap-2">
      <AppLogo size={44} />
      <Typography.Heading type="h5" accessibilityRole="header">
        FlatMate
      </Typography.Heading>
    </View>
  );
}
