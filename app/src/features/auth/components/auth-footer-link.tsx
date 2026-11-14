import { LinkButton, Typography } from 'heroui-native';
import { View } from 'react-native';

type AuthFooterLinkProps = {
  prompt: string;
  action: string;
  onPress: () => void;
};

/** A quiet line at the bottom of an auth screen, such as "New to FlatMate? Create an account". */
export function AuthFooterLink({ prompt, action, onPress }: AuthFooterLinkProps) {
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-1 pt-2">
      <Typography.Paragraph type="body-sm" color="muted">
        {prompt}
      </Typography.Paragraph>
      <LinkButton size="sm" onPress={onPress}>
        <LinkButton.Label className="font-semibold text-accent">{action}</LinkButton.Label>
      </LinkButton>
    </View>
  );
}
