import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Button, Card, Chip, PressableFeedback, Typography, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { MyApartment } from '@/features/apartments/api';
import { useMyApartments } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { ProfileAvatar } from '@/features/profile/components/profile-avatar';
import { useProfile } from '@/features/profile/hooks';
import { PastApartments } from '@/features/settlement/components/past-apartments';
import { userErrorMessage } from '@/lib/errors';

export default function MyApartmentsScreen() {
  const userId = useCurrentUserId();
  const profile = useProfile(userId);
  const apartments = useMyApartments();

  return (
    <Screen refreshing={apartments.isRefetching} onRefresh={() => void apartments.refetch()}>
      <View className="flex-row items-center justify-between">
        <Typography.Heading type="h2" accessibilityRole="header">
          Your apartments
        </Typography.Heading>
        <PressableFeedback
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
        >
          <ProfileAvatar
            name={profile.data?.display_name}
            avatarPath={profile.data?.avatar_path}
            size="sm"
          />
        </PressableFeedback>
      </View>

      {apartments.isPending ? (
        <LoadingRows />
      ) : apartments.isError ? (
        <LoadError
          message={userErrorMessage(apartments.error, 'Could not load your apartments.')}
          onRetry={() => void apartments.refetch()}
        />
      ) : apartments.data.length === 0 ? (
        <EmptyState />
      ) : (
        <View className="gap-3">
          {apartments.data.map((item) => (
            <ApartmentCard key={item.apartment.id} item={item} />
          ))}
        </View>
      )}

      {apartments.data && apartments.data.length > 0 ? (
        <Button variant="secondary" onPress={() => router.push('/apartments/new')}>
          Create or join another apartment
        </Button>
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
        router.push({
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

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center gap-4 py-10">
      <Typography.Heading type="h4" className="text-center">
        You are not in an apartment yet
      </Typography.Heading>
      <Typography.Paragraph color="muted" className="text-center">
        Create one for your flat, or join with the code a flatmate shares with you.
      </Typography.Paragraph>
      <Button onPress={() => router.push('/apartments/new')}>Create or join an apartment</Button>
    </View>
  );
}
