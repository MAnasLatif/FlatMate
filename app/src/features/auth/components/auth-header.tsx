import { Typography } from 'heroui-native';
import { View } from 'react-native';

import { AppLogo } from '@/components/app-logo';

type AuthHeaderProps = {
  title: string;
  subtitle?: string;
};

/** The brand mark, then the screen's title and a short line under it. */
export function AuthHeader({ title, subtitle }: AuthHeaderProps) {
  return (
    <View className="items-center gap-4 pt-4">
      <AppLogo size={96} />
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
