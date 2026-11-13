import { router } from 'expo-router';
import { Button, Typography } from 'heroui-native';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { ProfileAvatar } from '@/features/profile/components/profile-avatar';
import { useProfile } from '@/features/profile/hooks';

export default function HomeScreen() {
  const userId = useCurrentUserId();
  const profile = useProfile(userId);

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-6">
        <ProfileAvatar
          name={profile.data?.display_name}
          avatarPath={profile.data?.avatar_path}
          size="lg"
        />
        <View className="items-center gap-2">
          <Typography.Heading type="h2" accessibilityRole="header">
            {profile.data?.display_name
              ? `Hello, ${profile.data.display_name}`
              : 'Welcome to FlatMate'}
          </Typography.Heading>
          <Typography.Paragraph color="muted" className="text-center">
            Your apartments will appear here.
          </Typography.Paragraph>
        </View>
        <Button variant="secondary" onPress={() => router.push('/profile')}>
          Your profile
        </Button>
      </View>
    </Screen>
  );
}
