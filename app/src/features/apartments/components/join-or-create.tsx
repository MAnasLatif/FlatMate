import { router } from 'expo-router';
import { Button, Separator, Typography } from 'heroui-native';
import { View } from 'react-native';

import { JoinApartment } from './join-apartment';

/** For someone with no apartment: join with a code right here, or create one. */
export function JoinOrCreate() {
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
