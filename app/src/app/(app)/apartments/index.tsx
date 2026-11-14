import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Button, Card, Chip, PressableFeedback, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { MyApartment } from '@/features/apartments/api';
import { JoinOrCreate } from '@/features/apartments/components/join-or-create';
import { MyJoinRequests } from '@/features/apartments/components/my-join-requests';
import { useMyApartments } from '@/features/apartments/hooks';
import { PastApartments } from '@/features/settlement/components/past-apartments';
import { userErrorMessage } from '@/lib/errors';

/** Every apartment the user is in, reached from the apartment switcher. */
export default function MyApartmentsScreen() {
  const apartments = useMyApartments();

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
            <ApartmentCard key={item.apartment.id} item={item} />
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

function ApartmentCard({ item }: { item: MyApartment }) {
  const mutedColor = useThemeColor('muted');
  const { apartment } = item;

  return (
    <PressableFeedback
      onPress={() =>
        router.replace({
          pathname: '/apartments/[apartmentId]',
          params: { apartmentId: apartment.id },
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`Open ${apartment.name}`}
    >
      <Card>
        <Card.Body className="flex-row items-center gap-3">
          <View className="flex-1 gap-1">
            <Card.Title>{apartment.name}</Card.Title>
            {apartment.show_location && apartment.location ? (
              <Card.Description>{apartment.location}</Card.Description>
            ) : null}
          </View>
          {item.role === 'admin' ? (
            <Chip size="sm" variant="secondary">
              Admin
            </Chip>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={mutedColor} />
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
