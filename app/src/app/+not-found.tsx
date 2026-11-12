import Link from 'expo-router/link';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text className="text-2xl font-bold text-foreground" accessibilityRole="header">
        Page not found
      </Text>
      <Text className="text-center text-base text-muted">
        This screen does not exist or is no longer available.
      </Text>
      <Link href="/" replace>
        <Text className="text-base font-semibold text-accent">Go to the home screen</Text>
      </Link>
    </View>
  );
}
