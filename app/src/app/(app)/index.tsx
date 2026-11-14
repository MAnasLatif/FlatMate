import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import {
  Button,
  Card,
  Chip,
  PressableFeedback,
  Separator,
  Typography,
  useThemeColor,
} from 'heroui-native';
import { View } from 'react-native';

import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { MyApartment } from '@/features/apartments/api';
import { JoinApartment } from '@/features/apartments/components/join-apartment';
import { useMyApartments } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { ProfileAvatar } from '@/features/profile/components/profile-avatar';
import { useProfile } from '@/features/profile/hooks';
import { PastApartments } from '@/features/settlement/components/past-apartments';
import { userErrorMessage } from '@/lib/errors';

export default function MyApartmentsScreen() {
  const userId = useCurrentUserId();
  const profile = useProfile(userId);
  const apartments = useMyApartments();

  return (
    <Screen
      freshness={apartments}
      refreshing={apartments.isRefetching}
      onRefresh={() => void apartments.refetch()}
    >
      <View className="flex-row items-center justify-between">
        <Typography.Heading type="h2" accessibilityRole="header">
          Your apartments
        </Typography.Heading>
        <View className="flex-row items-center gap-5">
          <NotificationBell userId={userId} />
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
      </View>

      {apartments.isPending ? (
        <LoadingRows />
      ) : apartments.isLoadingError ? (
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

/** No apartment yet: join with a code right here, or go create one. */
function EmptyState() {
  return (
    <View className="gap-6 py-6">
      <View className="gap-2">
        <Typography.Heading type="h4">Join your flat</Typography.Heading>
        <Typography.Paragraph color="muted">
          Enter the code a flatmate shared with you.
        </Typography.Paragraph>
      </View>
      <JoinApartment />
      <View className="flex-row items-center gap-3">
        <Separator className="flex-1" />
        <Typography.Paragraph type="body-sm" color="muted">
          or
        </Typography.Paragraph>
        <Separator className="flex-1" />
      </View>
      <Button variant="secondary" onPress={() => router.push('/apartments/new')}>
        Create new apartment
      </Button>
    </View>
  );
}
