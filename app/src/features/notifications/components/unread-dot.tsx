import { View } from 'react-native';

/**
 * The red dot on whatever has an unread notification behind it. It is only a
 * picture: the element it sits on says "new" to screen readers itself.
 */
export function UnreadDot({ overlay = false }: { overlay?: boolean }) {
  return (
    <View
      testID="unread-dot"
      className={
        overlay
          ? 'absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-danger'
          : 'size-2.5 rounded-full bg-danger'
      }
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

/** Adds "new" to an accessibility label when the element has an unread notification. */
export function withUnread(label: string, unread: boolean): string {
  return unread ? `${label}, new` : label;
}
