import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Button, Card, PressableFeedback, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { MyApartment } from '@/features/apartments/api';
import { JoinOrCreate } from '@/features/apartments/components/join-or-create';
import { MyJoinRequests } from '@/features/apartments/components/my-join-requests';
import { useMyApartments } from '@/features/apartments/hooks';
import { UnreadDot, withUnread } from '@/features/notifications/components/unread-dot';
import { useIsUnread, useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { PastApartments } from '@/features/settlement/components/past-apartments';
import { userErrorMessage } from '@/lib/errors';

/** Every apartment the user is in, reached from the apartment switcher. */
export default function MyApartmentsScreen() {
  const apartments = useMyApartments();
  const isUnread = useIsUnread();
  // A declined request to join is shown here too, with the user's other requests.
  useMarkSeen(unreadMatches.joinRequests());

  return (
    <Screen
      freshness={apartments}
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
      ) : apartments.data.length === 0 ? (
        <JoinOrCreate />
      ) : (
        <View className="gap-3">
          {apartments.data.map((item) => (
            <ApartmentCard
              key={item.apartment.id}
              item={item}
              unread={isUnread(unreadMatches.inApartments([item.apartment.id]))}
            />
          ))}
        </View>
      )}

      {apartments.data && apartments.data.length > 0 ? (
        <View className="flex-row gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onPress={() => router.push('/apartments/join')}
          >
            Join an apartment
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onPress={() => router.push('/apartments/new')}
          >
            Create new
          </Button>
        </View>
      ) : null}

      <PastApartments />
    </Screen>
  );
}

function ApartmentCard({ item, unread }: { item: MyApartment; unread: boolean }) {
  const mutedColor = useThemeColor('muted');
  const { apartment } = item;

  return (
    <PressableFeedback
      onPress={() => {
        // The chosen apartment takes the place of the one this list was
        // opened from, so Back does not return to it.
        router.dismissAll();
        router.replace({
          pathname: '/apartments/[apartmentId]',
          params: { apartmentId: apartment.id },
        });
      }}
      accessibilityRole="button"
      accessibilityLabel={withUnread(`Open ${apartment.name}`, unread)}
    >
      <Card>
        <Card.Body className="flex-row items-center gap-3">
          <View className="flex-1 gap-1">
            <View className="flex-row items-center gap-2">
              <Card.Title>{apartment.name}</Card.Title>
              {unread ? <UnreadDot /> : null}
            </View>
            {apartment.show_location && apartment.location ? (
              <Card.Description>{apartment.location}</Card.Description>
            ) : null}
          </View>
          {/* Settings live here, beside the apartment, for its admins only;
              the gear is how an admin's apartment stands out. */}
          {item.role === 'admin' ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              onPress={() =>
                router.push({
                  pathname: '/apartments/[apartmentId]/settings',
                  params: { apartmentId: apartment.id },
                })
              }
              accessibilityLabel={`Settings for ${apartment.name}`}
            >
              <Ionicons name="settings-outline" size={20} color={mutedColor} />
            </Button>
          ) : null}
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
