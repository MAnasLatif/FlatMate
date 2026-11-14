import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomSheet, Button, useThemeColor } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { authErrorMessage } from '@/features/auth/errors';

import { useSignOut } from '../hooks';

/** The sign-out icon in the profile screen's header, confirmed in a sheet. */
export function SignOutButton() {
  const signOut = useSignOut();
  const [isOpen, setOpen] = useState(false);
  const iconColor = useThemeColor('danger');

  return (
    <>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        onPress={() => setOpen(true)}
        accessibilityLabel="Sign out"
      >
        <Ionicons name="log-out-outline" size={22} color={iconColor} />
      </Button>
      <BottomSheet isOpen={isOpen} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            <View className="gap-6">
              <View className="gap-2">
                <BottomSheet.Title>Sign out?</BottomSheet.Title>
                <BottomSheet.Description>
                  This phone will stop getting FlatMate notifications until you sign in again.
                </BottomSheet.Description>
              </View>
              <FormAlert message={signOut.error ? authErrorMessage(signOut.error) : null} />
              <View className="gap-3">
                <OnlineButton
                  variant="danger"
                  onPress={() => signOut.mutate()}
                  isDisabled={signOut.isPending}
                >
                  {signOut.isPending ? 'Signing out…' : 'Sign out'}
                </OnlineButton>
                <Button
                  variant="tertiary"
                  onPress={() => setOpen(false)}
                  isDisabled={signOut.isPending}
                >
                  Cancel
                </Button>
              </View>
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}
