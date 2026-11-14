import { Image } from 'expo-image';
import { Typography } from 'heroui-native';
import { StyleSheet, useColorScheme, View } from 'react-native';

const logoMark = require('@/assets/images/logo-mark.png');
const logoMarkDark = require('@/assets/images/logo-mark-dark.png');

type AuthHeaderProps = {
  title: string;
  subtitle?: string;
};

/** The brand mark on a soft tile, then the screen's title and a short line under it. */
export function AuthHeader({ title, subtitle }: AuthHeaderProps) {
  const isDark = useColorScheme() === 'dark';

  return (
    <View className="items-center gap-6 pt-6">
      <View className="size-20 items-center justify-center rounded-3xl bg-surface-secondary">
        <Image
          source={isDark ? logoMarkDark : logoMark}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel="FlatMate"
        />
      </View>
      <View className="items-center gap-2">
        <Typography.Heading type="h2" accessibilityRole="header" className="text-center">
          {title}
        </Typography.Heading>
        {subtitle ? (
          <Typography.Paragraph color="muted" className="max-w-80 text-center">
            {subtitle}
          </Typography.Paragraph>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 52, height: 52 },
});
