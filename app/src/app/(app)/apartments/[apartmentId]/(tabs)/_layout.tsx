import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { PressableFeedback, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { ApartmentSwitcher } from '@/features/apartments/components/apartment-switcher';
import { useApartmentId, useMyMembership } from '@/features/apartments/hooks';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function ApartmentTabsLayout() {
  const apartmentId = useApartmentId();
  const [accent, muted] = useThemeColor(['accent', 'muted']);

  return (
    <Tabs
      screenOptions={{
        headerTitle: () => <ApartmentSwitcher apartmentId={apartmentId} />,
        headerTitleAlign: 'left',
        headerRight: () => <HeaderActions apartmentId={apartmentId} />,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: muted,
      }}
    >
      {/* SRS section 3.2: Profile on the left, Expenses on the right. */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="person-circle-outline" focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Expenses',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="receipt-outline" focused={focused} size={size} />
          ),
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

  return (
    <View className="flex-row items-center gap-4 pr-4">
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
