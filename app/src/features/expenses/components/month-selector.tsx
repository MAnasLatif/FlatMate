import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomSheet, Button, PressableFeedback, Typography, useThemeColor } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import {
  WHEEL_ROW_HEIGHT,
  WHEEL_VISIBLE_ROWS,
  WheelPicker,
  type WheelItem,
} from '@/components/form/wheel-picker';

import { addMonths, formatMonth } from '@/lib/time';

/** How many years the selector reaches: the latest month's year and the one before. */
const YEARS_SHOWN = 2;

/**
 * Steps through months with the arrows, or jumps to one from a month and year
 * picker opened by tapping the month. Never goes past `latestMonth`, nor
 * before January of the year before it. Months are YYYY-MM-01 dates.
 */
export function MonthSelector({
  month,
  latestMonth,
  onChange,
}: {
  month: string;
  latestMonth: string;
  onChange: (month: string) => void;
}) {
  const [isOpen, setOpen] = useState(false);
  // Each opening starts the wheels again on the month being shown.
  const [openCount, setOpenCount] = useState(0);
  const latestYear = Number(latestMonth.slice(0, 4));
  const earliestMonth = `${latestYear - YEARS_SHOWN + 1}-01-01`;

  return (
    <>
      {/* The sheet stays outside this row, so it takes no room in it. */}
      <View className="flex-row items-center justify-between">
        <MonthArrow
          direction="back"
          isHidden={month <= earliestMonth}
          onPress={() => onChange(addMonths(month, -1))}
        />
        <PressableFeedback
          onPress={() => {
            setOpenCount((count) => count + 1);
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Showing ${formatMonth(month)}`}
          accessibilityHint="Opens a month and year picker"
          className="min-h-12 justify-center rounded-full px-3"
        >
          <Typography.Heading type="h6">{formatMonth(month)}</Typography.Heading>
        </PressableFeedback>
        <MonthArrow
          direction="forward"
          isHidden={month >= latestMonth}
          onPress={() => onChange(addMonths(month, 1))}
        />
      </View>

      {/* Always mounted: a sheet mounted already open does not appear. */}
      <BottomSheet isOpen={isOpen} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          {/* Drags inside the sheet turn the wheels instead of moving the sheet. */}
          <BottomSheet.Content enableContentPanningGesture={false}>
            <MonthWheels
              key={openCount}
              month={month}
              latestMonth={latestMonth}
              onDone={(picked) => {
                onChange(picked);
                setOpen(false);
              }}
            />
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}

/**
 * A step to the previous or next month. Where there is nothing further it is
 * hidden, keeping its space so the month stays centred.
 */
function MonthArrow({
  direction,
  isHidden,
  onPress,
}: {
  direction: 'back' | 'forward';
  isHidden: boolean;
  onPress: () => void;
}) {
  const iconColor = useThemeColor('foreground');
  // A small icon button is 40dp across.
  if (isHidden) return <View className="size-10" />;
  return (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      onPress={onPress}
      accessibilityLabel={direction === 'back' ? 'Previous month' : 'Next month'}
      // This makes the touch area the 48dp minimum.
      hitSlop={4}
    >
      <Ionicons
        name={direction === 'back' ? 'chevron-back' : 'chevron-forward'}
        size={20}
        color={iconColor}
      />
    </Button>
  );
}

/**
 * A month wheel and a year wheel, like a date picker without the day. The
 * years are `latestMonth`'s and the one before; months after `latestMonth`
 * are left out. Nothing changes until Done is pressed.
 */
function MonthWheels({
  month,
  latestMonth,
  onDone,
}: {
  month: string;
  latestMonth: string;
  onDone: (month: string) => void;
}) {
  const latestYear = Number(latestMonth.slice(0, 4));
  const latestMonthNumber = Number(latestMonth.slice(5, 7));
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const [monthNumber, setMonthNumber] = useState(() => Number(month.slice(5, 7)));

  const lastMonthOf = (candidate: number) => (candidate === latestYear ? latestMonthNumber : 12);
  const years: WheelItem<number>[] = Array.from({ length: YEARS_SHOWN }, (_, index) => {
    const value = latestYear - YEARS_SHOWN + 1 + index;
    return { value, label: String(value) };
  });
  const months: WheelItem<number>[] = Array.from({ length: lastMonthOf(year) }, (_, index) => {
    const date = toMonth(year, index + 1);
    return { value: index + 1, label: monthName(date), accessibilityLabel: formatMonth(date) };
  });

  const chooseYear = (next: number) => {
    setYear(next);
    // Moving to this year from a later month of last year stops at the latest month.
    setMonthNumber((current) => Math.min(current, lastMonthOf(next)));
  };

  return (
    <View className="gap-4">
      <BottomSheet.Title>Choose a month</BottomSheet.Title>
      <View style={{ height: WHEEL_ROW_HEIGHT * WHEEL_VISIBLE_ROWS }}>
        {/* The band behind the middle row, shared by both wheels. */}
        <View
          className="absolute inset-x-0 rounded-xl bg-default"
          style={{
            top: ((WHEEL_VISIBLE_ROWS - 1) / 2) * WHEEL_ROW_HEIGHT,
            height: WHEEL_ROW_HEIGHT,
          }}
        />
        <View className="flex-row">
          <WheelPicker
            items={months}
            value={monthNumber}
            onChange={setMonthNumber}
            className="flex-[3]"
          />
          <WheelPicker items={years} value={year} onChange={chooseYear} className="flex-[2]" />
        </View>
      </View>
      <Button onPress={() => onDone(toMonth(year, monthNumber))}>Done</Button>
    </View>
  );
}

function toMonth(year: number, monthNumber: number): string {
  return `${year}-${String(monthNumber).padStart(2, '0')}-01`;
}

/** "November" for a YYYY-MM-DD date, in the device's locale. */
function monthName(date: string): string {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    timeZone: 'UTC',
  });
}
