import { Image } from 'expo-image';
import { Typography } from 'heroui-native';
import { StyleSheet, useColorScheme, View } from 'react-native';

const logoMark = require('@/assets/images/logo-mark.png');
const logoMarkDark = require('@/assets/images/logo-mark-dark.png');

type AuthHeaderProps = {
  title: string;
  subtitle?: string;
};

export function AuthHeader({ title, subtitle }: AuthHeaderProps) {
  const isDark = useColorScheme() === 'dark';

  return (
    <View className="items-center gap-3 pt-4">
      <Image
        source={isDark ? logoMarkDark : logoMark}
        style={styles.logo}
        contentFit="contain"
        accessibilityLabel="FlatMate"
      />
      <Typography.Heading type="h2" accessibilityRole="header" className="text-center">
        {title}
      </Typography.Heading>
      {subtitle ? (
        <Typography.Paragraph color="muted" className="text-center">
          {subtitle}
        </Typography.Paragraph>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 96, height: 96 },
});
