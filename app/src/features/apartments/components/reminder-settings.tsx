import { Typography } from 'heroui-native';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { FormAlert } from '@/components/form/form-alert';
import { SwitchRow } from '@/components/form/switch-row';
import type { Apartment } from '@/features/apartments/api';
import { APARTMENT_ERROR_MESSAGES } from '@/features/apartments/errors';
import { useUpdateApartmentReminders } from '@/features/apartments/hooks';
import {
  DEFAULT_DUE_REMINDER_DAYS,
  DEFAULT_SETTLEMENT_REMINDER_DAYS,
  dueReminderChoices,
  type ReminderSchedule,
  settlementReminderChoices,
} from '@/features/apartments/reminders';
import { userErrorMessage } from '@/lib/errors';
import { useIsOnline } from '@/lib/network';

/**
 * When the apartment's reminders go out, for admins (FR-09.2). Every change
 * saves at once; offline the controls wait for a connection.
 */
export function ReminderSettings({ apartment }: { apartment: Apartment }) {
  const update = useUpdateApartmentReminders(apartment.id);
  const isOnline = useIsOnline();
  const schedule: ReminderSchedule = {
    dueReminderDays: apartment.due_reminder_days,
    settlementReminderDays: apartment.settlement_reminder_days,
  };
  const save = (change: Partial<ReminderSchedule>) => {
    if (!isOnline) return;
    update.mutate({ ...schedule, ...change });
  };

  return (
    <View className="gap-3">
      <Typography.Heading type="h6">Reminders</Typography.Heading>
      <Typography.Paragraph type="body-xs" color="muted">
        Sent from 9 am in the apartment&apos;s time zone. Each person can turn reminders off for
        their own phone in their profile.
      </Typography.Paragraph>
      <FormAlert
        message={
          update.error
            ? userErrorMessage(
                update.error,
                'Could not save the reminders.',
                APARTMENT_ERROR_MESSAGES,
              )
            : null
        }
      />
      <SwitchRow
        label="Bills due"
        description="Whoever pays an unpaid bill is reminded before its due date and on the day. If nobody is named, the admins are."
        isSelected={schedule.dueReminderDays !== null}
        onSelectedChange={(isOn) =>
          save({ dueReminderDays: isOn ? DEFAULT_DUE_REMINDER_DAYS : null })
        }
        isDisabled={!isOnline}
      />
      {schedule.dueReminderDays !== null ? (
        <ChoiceChips
          accessibilityLabel="When to remind about a bill"
          choices={dueReminderChoices(schedule.dueReminderDays)}
          selected={String(schedule.dueReminderDays)}
          onSelect={(value) => save({ dueReminderDays: Number(value) })}
        />
      ) : null}
      <SwitchRow
        label="Settlement day"
        description="Members who still owe someone are reminded before the settlement day."
        isSelected={schedule.settlementReminderDays !== null}
        onSelectedChange={(isOn) =>
          save({ settlementReminderDays: isOn ? DEFAULT_SETTLEMENT_REMINDER_DAYS : null })
        }
        isDisabled={!isOnline}
      />
      {schedule.settlementReminderDays !== null ? (
        <ChoiceChips
          accessibilityLabel="When to remind about settlement"
          choices={settlementReminderChoices(schedule.settlementReminderDays)}
          selected={String(schedule.settlementReminderDays)}
          onSelect={(value) => save({ settlementReminderDays: Number(value) })}
        />
      ) : null}
      {isOnline ? null : (
        <Typography.Paragraph type="body-xs" color="muted">
          You are offline. Reconnect to change reminders.
        </Typography.Paragraph>
      )}
    </View>
  );
}
