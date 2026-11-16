import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BottomSheet,
  Button,
  FieldError,
  Label,
  PressableFeedback,
  TextField,
  Typography,
  useThemeColor,
} from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { addMonths, formatDate, formatMonth, monthGrid, monthStart } from '@/lib/time';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type DateFieldProps = {
  label: string;
  /** A YYYY-MM-DD date, or '' when none is chosen. */
  value: string;
  onChange: (date: string) => void;
  /** The day the calendar opens on when no date is chosen yet, such as today. */
  today: string;
  /** The earliest and latest dates that can be picked, as YYYY-MM-DD. */
  minDate?: string;
  maxDate?: string;
  isRequired?: boolean;
  /** An optional date can be cleared again. */
  isClearable?: boolean;
  isDisabled?: boolean;
  error?: string;
};

/**
 * A date picked from a calendar instead of typed: the field shows the date,
 * and tapping it opens a month calendar in a sheet.
 */
export function DateField({
  label,
  value,
  onChange,
  today,
  minDate,
  maxDate,
  isRequired,
  isClearable,
  isDisabled,
  error,
}: DateFieldProps) {
  const [isOpen, setOpen] = useState(false);
  // The calendar is built the first time it opens, not with every form.
  const [hasOpened, setHasOpened] = useState(false);
  const [month, setMonth] = useState(() => monthStart(value || today));
  const [mutedColor, foregroundColor] = useThemeColor(['muted', 'foreground']);

  const open = () => {
    setMonth(monthStart(value || today));
    setHasOpened(true);
    setOpen(true);
  };
  const pick = (date: string) => {
    onChange(date);
    setOpen(false);
  };
  const isAllowed = (date: string) =>
    (minDate === undefined || date >= minDate) && (maxDate === undefined || date <= maxDate);
  const canGoBack = minDate === undefined || addMonths(month, -1) >= monthStart(minDate);
  const canGoForward = maxDate === undefined || addMonths(month, 1) <= monthStart(maxDate);

  return (
    <TextField isRequired={isRequired} isInvalid={error !== undefined}>
      <Label>{label}</Label>
      <PressableFeedback
        onPress={open}
        isDisabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ? formatDate(value) : 'not chosen'}`}
        accessibilityHint="Opens a calendar"
        className="min-h-12 flex-row items-center gap-3 rounded-field bg-default px-3"
      >
        <Ionicons name="calendar-outline" size={18} color={mutedColor} />
        <Typography.Paragraph color={value ? undefined : 'muted'} className="flex-1">
          {value ? formatDate(value) : 'Choose a date'}
        </Typography.Paragraph>
      </PressableFeedback>
      <FieldError>{error}</FieldError>

      {/* Always mounted: a sheet mounted already open does not appear, so the
          first taps on the field did nothing. Only the calendar inside waits. */}
      <BottomSheet isOpen={isOpen} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            {hasOpened ? (
              <View className="gap-4">
                <View className="flex-row items-center justify-between">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    isDisabled={!canGoBack}
                    onPress={() => setMonth(addMonths(month, -1))}
                    accessibilityLabel="Previous month"
                  >
                    <Ionicons name="chevron-back" size={20} color={foregroundColor} />
                  </Button>
                  <BottomSheet.Title>{formatMonth(month)}</BottomSheet.Title>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    isDisabled={!canGoForward}
                    onPress={() => setMonth(addMonths(month, 1))}
                    accessibilityLabel="Next month"
                  >
                    <Ionicons name="chevron-forward" size={20} color={foregroundColor} />
                  </Button>
                </View>

                <View className="flex-row">
                  {WEEKDAYS.map((weekday) => (
                    <Typography.Paragraph
                      key={weekday}
                      type="body-xs"
                      color="muted"
                      className="flex-1 text-center"
                    >
                      {weekday}
                    </Typography.Paragraph>
                  ))}
                </View>
                <View className="flex-row flex-wrap">
                  {monthGrid(month).map((date, index) =>
                    date ? (
                      <DayCell
                        key={date}
                        date={date}
                        isSelected={date === value}
                        isToday={date === today}
                        isAllowed={isAllowed(date)}
                        onPick={pick}
                      />
                    ) : (
                      <View key={`blank-${index}`} className="aspect-square w-[14.28%]" />
                    ),
                  )}
                </View>

                {isClearable && value ? (
                  <Button variant="ghost" onPress={() => pick('')}>
                    Clear date
                  </Button>
                ) : null}
              </View>
            ) : null}
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </TextField>
  );
}

function DayCell({
  date,
  isSelected,
  isToday,
  isAllowed,
  onPick,
}: {
  date: string;
  isSelected: boolean;
  isToday: boolean;
  isAllowed: boolean;
  onPick: (date: string) => void;
}) {
  return (
    <View className="aspect-square w-[14.28%] p-0.5">
      <PressableFeedback
        onPress={() => onPick(date)}
        isDisabled={!isAllowed}
        accessibilityRole="button"
        accessibilityLabel={formatDate(date)}
        accessibilityState={{ selected: isSelected, disabled: !isAllowed }}
        className={`flex-1 items-center justify-center rounded-full ${
          isSelected ? 'bg-accent' : isToday ? 'border border-accent' : ''
        }`}
      >
        <Typography.Paragraph
          className={
            isSelected ? 'font-semibold text-accent-foreground' : isAllowed ? '' : 'opacity-30'
          }
        >
          {Number(date.slice(8))}
        </Typography.Paragraph>
      </PressableFeedback>
    </View>
  );
}
