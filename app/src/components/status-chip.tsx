import { Chip } from 'heroui-native';
import type { ComponentProps } from 'react';

/**
 * A chip that only shows a status, such as "Provisional" or "Admin".
 *
 * HeroUI's `Chip` is always a `Pressable`. Inside a pressable row it would take
 * the tap without doing anything, and screen readers would announce it as a
 * separate control. This one lets taps through to the row and is read as part
 * of the surrounding text. Use `Chip` itself only for chips that act on a press.
 *
 * React Native's `Pressable` stays focusable on Android unless told otherwise,
 * so `accessible={false}` alone does not take it out of the accessibility tree.
 */
export function StatusChip(props: Omit<ComponentProps<typeof Chip>, 'onPress'>) {
  return (
    <Chip
      {...props}
      pointerEvents="none"
      accessible={false}
      focusable={false}
      importantForAccessibility="no"
    />
  );
}
