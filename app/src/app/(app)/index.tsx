import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Button, Typography } from 'heroui-native';
import { StyleSheet, useColorScheme, View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { Screen } from '@/components/screen';
import { signOut } from '@/features/auth/api';
import { authErrorMessage } from '@/features/auth/errors';
import { useSession } from '@/features/auth/session-provider';

const logoMark = require('@/assets/images/logo-mark.png');
const logoMarkDark = require('@/assets/images/logo-mark-dark.png');

export default function HomeScreen() {
  const isDark = useColorScheme() === 'dark';
  const { session } = useSession();
  const signOutMutation = useMutation({ mutationFn: signOut });

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-6">
        <Image
          source={isDark ? logoMarkDark : logoMark}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="FlatMate logo"
        />
        <View className="items-center gap-2">
          <Typography.Heading type="h1" accessibilityRole="header">
            FlatMate
          </Typography.Heading>
          <Typography.Paragraph color="muted">
            Signed in as {session?.user.email}
          </Typography.Paragraph>
        </View>
        <FormAlert
          message={signOutMutation.error ? authErrorMessage(signOutMutation.error) : null}
        />
        <Button
          variant="secondary"
          onPress={() => signOutMutation.mutate()}
          isDisabled={signOutMutation.isPending}
        >
          Sign out
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { width: 160, height: 160 },
});
