import Ionicons from '@expo/vector-icons/Ionicons';
import { PressableFeedback, useThemeColor } from 'heroui-native';

import { HEADER_ICON_SIZE } from '@/components/screen-transitions';

/**
 * For admins, in the members screen's top bar. Inviting happens on the Join
 * code card in the settings, so this opens it.
 */
export function AddMemberButton({ onPress }: { onPress: () => void }) {
  const iconColor = useThemeColor('foreground');
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add member"
      accessibilityHint="Opens the join code, to share or email it"
      hitSlop={8}
    >
      <Ionicons name="person-add-outline" size={HEADER_ICON_SIZE} color={iconColor} />
    </PressableFeedback>
  );
}
