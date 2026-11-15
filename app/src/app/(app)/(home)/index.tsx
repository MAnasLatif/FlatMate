import { Redirect } from 'expo-router';

import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { JoinOrCreate } from '@/features/apartments/components/join-or-create';
import { MyJoinRequests } from '@/features/apartments/components/my-join-requests';
import { useMyApartments } from '@/features/apartments/hooks';
import { startingApartment, useLastApartment } from '@/features/apartments/last-apartment';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
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
  // A declined request to join opens here, where the user's requests are.
  useMarkSeen(unreadMatches.joinRequests());

  if (apartments.data && apartments.data.length > 0) {
    // Wait for the remembered apartment, so the app does not open one and then jump.
    if (lastApartmentId === undefined) return <Screen padTop={false}>{null}</Screen>;
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
      padTop={false}
      refreshing={apartments.isRefetching}
      onRefresh={() => void apartments.refetch()}
    >
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
