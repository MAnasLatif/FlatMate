import { Typography } from 'heroui-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * The red dot on a row or button with an unread notification behind it. It is
 * only a picture: the element it sits on says "new" to screen readers itself.
 */
export function UnreadDot() {
  return (
    <View
      testID="unread-dot"
      className="size-2.5 rounded-full bg-danger"
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

/**
 * An icon with a red badge counting what is unread behind it. The icon sits in
 * a padded box and the badge stays inside that box, so a parent that clips its
 * children, as pressables do, never cuts it off. The padding is there with or
 * without a badge, so the icon does not move when one appears.
 */
export function UnreadBadge({ count, children }: { count: number; children: ReactNode }) {
  return (
    <View className="p-1.5">
      {children}
      {count > 0 ? (
        <View
          testID="unread-badge"
          className="absolute right-0 top-0 h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          <Typography.Paragraph
            weight="semibold"
            className="text-[10px] leading-3 text-danger-foreground"
            maxFontSizeMultiplier={1.2}
          >
            {count > 99 ? '99+' : String(count)}
          </Typography.Paragraph>
        </View>
      ) : null}
    </View>
  );
}

/** Adds "new", or how many are new, to an accessibility label. */
export function withUnread(label: string, unread: boolean | number): string {
  if (typeof unread === 'number') return unread > 0 ? `${label}, ${unread} new` : label;
  return unread ? `${label}, new` : label;
}
