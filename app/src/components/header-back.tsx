import Ionicons from '@expo/vector-icons/Ionicons';
import { PressableFeedback, useThemeColor } from 'heroui-native';

/**
 * A back arrow for a tab's header, which has none of its own: tabs are not
 * stacked, so the screen says where back goes.
 */
export function HeaderBack({ onPress }: { onPress: () => void }) {
  const color = useThemeColor('foreground');
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={12}
      className="pl-4 pr-2"
    >
      <Ionicons name="arrow-back" size={24} color={color} />
    </PressableFeedback>
  );
}
