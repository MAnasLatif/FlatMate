import { View } from 'react-native';

import { useCurrentUserId } from '@/features/auth/session-provider';

import { useProfile } from '../hooks';
import { ProfileAvatar } from './profile-avatar';

/** The signed-in user's photo as the Profile tab's icon, ringed when the tab is open. */
export function ProfileTabIcon({ focused }: { focused: boolean }) {
  const userId = useCurrentUserId();
  const profile = useProfile(userId);
  return (
    <View
      className={`rounded-full border-2 p-0.5 ${focused ? 'border-accent' : 'border-transparent'}`}
    >
      <ProfileAvatar
        name={profile.data?.display_name}
        avatarPath={profile.data?.avatar_path}
        size="xs"
      />
    </View>
  );
}
