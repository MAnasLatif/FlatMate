import { Redirect } from 'expo-router';
import { Typography } from 'heroui-native';
import { View } from 'react-native';

import { AppLogo } from '@/components/app-logo';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { JoinOrCreate } from '@/features/apartments/components/join-or-create';
import { MyJoinRequests } from '@/features/apartments/components/my-join-requests';
import { useMyApartments } from '@/features/apartments/hooks';
import { startingApartment, useLastApartment } from '@/features/apartments/last-apartment';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { PastApartments } from '@/features/settlement/components/past-apartments';
import { userErrorMessage } from '@/lib/errors';

/**
 * Where the app opens. Someone in an apartment goes straight to it: the one
 * they last opened, or their first. Someone in none sees how to join or
 * create one.
 */
export default function HomeScreen() {
  const userId = useCurrentUserId();
  const apartments = useMyApartments();
  const lastApartmentId = useLastApartment(userId);

  if (apartments.data && apartments.data.length > 0) {
    // Wait for the remembered apartment, so the app does not open one and then jump.
    if (lastApartmentId === undefined) return <Screen>{null}</Screen>;
    const apartmentId = startingApartment(
      apartments.data.map((item) => item.apartment.id),
      lastApartmentId,
    );
    if (apartmentId) {
      return <Redirect href={{ pathname: '/apartments/[apartmentId]', params: { apartmentId } }} />;
    }
  }

  return (
    <Screen
      freshness={apartments}
      refreshing={apartments.isRefetching}
      onRefresh={() => void apartments.refetch()}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <AppLogo size={44} />
          <Typography.Heading type="h3" accessibilityRole="header">
            FlatMate
          </Typography.Heading>
        </View>
        <NotificationBell userId={userId} />
      </View>

      <MyJoinRequests />

      {apartments.isPending ? (
        <LoadingRows />
      ) : apartments.isLoadingError ? (
        <LoadError
          message={userErrorMessage(apartments.error, 'Could not load your apartments.')}
          onRetry={() => void apartments.refetch()}
        />
      ) : (
        <JoinOrCreate />
      )}

      <PastApartments />
    </Screen>
  );
}
