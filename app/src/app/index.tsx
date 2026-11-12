import { Image } from 'expo-image';
import { StyleSheet, Text, useColorScheme, View } from 'react-native';

const logoMark = require('@/assets/images/logo-mark.png');
const logoMarkDark = require('@/assets/images/logo-mark-dark.png');

export default function HomeScreen() {
  const isDark = useColorScheme() === 'dark';

  return (
    <View className="flex-1 items-center justify-center gap-6 bg-background px-6">
      <Image
        source={isDark ? logoMarkDark : logoMark}
        style={styles.logo}
        contentFit="contain"
        accessibilityLabel="FlatMate logo"
      />
      <View className="items-center gap-2">
        <Text className="text-4xl font-bold text-foreground" accessibilityRole="header">
          Flat<Text className="text-accent">Mate</Text>
        </Text>
        <Text className="text-base text-muted">Shared home. Smarter finances.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 160, height: 160 },
});
