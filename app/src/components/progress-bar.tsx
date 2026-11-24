import { View } from 'react-native';

/**
 * A thin bar filled to `percent` (0 to 100), in the colour `className` gives,
 * such as `bg-accent`. It draws only: the row it sits in carries the label.
 */
export function ProgressBar({ percent, className }: { percent: number; className: string }) {
  return (
    <View className="h-2 overflow-hidden rounded-full bg-default">
      <View className={`h-2 rounded-full ${className}`} style={{ width: `${percent}%` }} />
    </View>
  );
}
