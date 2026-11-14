import Stack from 'expo-router/stack';

import { ProfileContent } from '@/features/profile/components/profile-content';
import { SignOutButton } from '@/features/profile/components/sign-out-button';

export default function ProfileScreen() {
  return (
    <>
      <Stack.Screen options={{ headerRight: () => <SignOutButton /> }} />
      <ProfileContent />
    </>
  );
}
