import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Typography, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { addMonths, formatMonth } from '@/lib/time';

/** Steps through months, never past `latestMonth`. Months are YYYY-MM-01 dates. */
export function MonthSelector({
  month,
  latestMonth,
  onChange,
}: {
  month: string;
  latestMonth: string;
  onChange: (month: string) => void;
}) {
  const iconColor = useThemeColor('foreground');
  const isLatest = month >= latestMonth;

  return (
    <View className="flex-row items-center justify-between">
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        onPress={() => onChange(addMonths(month, -1))}
        accessibilityLabel="Previous month"
      >
        <Ionicons name="chevron-back" size={20} color={iconColor} />
      </Button>
      <Typography.Heading type="h6" accessibilityRole="header">
        {formatMonth(month)}
      </Typography.Heading>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        onPress={() => onChange(addMonths(month, 1))}
        isDisabled={isLatest}
        accessibilityLabel="Next month"
      >
        <Ionicons name="chevron-forward" size={20} color={iconColor} />
      </Button>
    </View>
  );
}
