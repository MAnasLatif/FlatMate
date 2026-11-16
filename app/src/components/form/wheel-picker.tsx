import { PressableFeedback, Typography } from 'heroui-native';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, View } from 'react-native';

/** The height of one row, and how many rows a wheel shows at once. */
export const WHEEL_ROW_HEIGHT = 44;
export const WHEEL_VISIBLE_ROWS = 5;
const PADDING_ROWS = (WHEEL_VISIBLE_ROWS - 1) / 2;

export type WheelItem<T> = { value: T; label: string; accessibilityLabel?: string };

/**
 * A column of choices that scrolls and snaps, with the chosen one in the
 * middle row. Draw the band that marks the middle row behind the wheels, so
 * several wheels side by side share one band. Rows can also be tapped, which
 * is how screen readers choose.
 */
export function WheelPicker<T extends string | number>({
  items,
  value,
  onChange,
  className,
}: {
  items: WheelItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );
  // The row in the middle while scrolling, so it is highlighted before the wheel stops.
  const [centredIndex, setCentredIndex] = useState(selectedIndex);
  const [initialOffset] = useState(() => selectedIndex * WHEEL_ROW_HEIGHT);

  // A choice made by a tap, or a value clamped by the caller, scrolls the wheel
  // to it. The scroll events then move the highlight.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: selectedIndex * WHEEL_ROW_HEIGHT, animated: true });
  }, [selectedIndex]);

  const indexAt = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    Math.min(
      items.length - 1,
      Math.max(0, Math.round(event.nativeEvent.contentOffset.y / WHEEL_ROW_HEIGHT)),
    );

  return (
    <View className={className} style={{ height: WHEEL_ROW_HEIGHT * WHEEL_VISIBLE_ROWS }}>
      <ScrollView
        ref={scrollRef}
        contentOffset={{ x: 0, y: initialOffset }}
        snapToInterval={WHEEL_ROW_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        scrollEventThrottle={16}
        onScroll={(event) => setCentredIndex(indexAt(event))}
        onMomentumScrollEnd={(event) => {
          const item = items[indexAt(event)];
          if (item && item.value !== value) onChange(item.value);
        }}
        contentContainerStyle={{ paddingVertical: PADDING_ROWS * WHEEL_ROW_HEIGHT }}
      >
        {items.map((item, index) => {
          const distance = Math.abs(index - centredIndex);
          return (
            <PressableFeedback
              key={String(item.value)}
              onPress={() => onChange(item.value)}
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel ?? item.label}
              accessibilityState={{ selected: index === selectedIndex }}
              className="items-center justify-center"
              style={{ height: WHEEL_ROW_HEIGHT }}
            >
              <Typography.Paragraph
                weight={distance === 0 ? 'semibold' : undefined}
                className={distance === 0 ? 'text-xl' : 'text-lg'}
                color={distance === 0 ? undefined : 'muted'}
                style={{ opacity: distance === 0 ? 1 : distance === 1 ? 0.7 : 0.35 }}
              >
                {item.label}
              </Typography.Paragraph>
            </PressableFeedback>
          );
        })}
      </ScrollView>
    </View>
  );
}
