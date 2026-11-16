import { LinkButton, Typography } from 'heroui-native';
import { View } from 'react-native';

type AuthFooterLinkProps = {
  /** Text before the link, such as "New to FlatMate?". */
  prompt?: string;
  action: string;
  onPress: () => void;
  isDisabled?: boolean;
};

/** A quiet line at the bottom of an auth screen, such as "New to FlatMate? Create an account". */
export function AuthFooterLink({ prompt, action, onPress, isDisabled }: AuthFooterLinkProps) {
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-1 pt-2">
      {prompt ? (
        <Typography.Paragraph type="body-sm" color="muted">
          {prompt}
        </Typography.Paragraph>
      ) : null}
      <LinkButton size="sm" onPress={onPress} isDisabled={isDisabled}>
        <LinkButton.Label className={isDisabled ? 'text-muted' : 'font-semibold text-accent'}>
          {action}
        </LinkButton.Label>
      </LinkButton>
    </View>
  );
}
