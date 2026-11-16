import { router } from 'expo-router';
import { Button, Card, PressableFeedback, Separator, Typography } from 'heroui-native';
import { Alert, View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { StatusChip } from '@/components/status-chip';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { userErrorMessage } from '@/lib/errors';
import { formatMinorUnits } from '@/lib/money';
import { formatDate, ordinal } from '@/lib/time';

import type { RecurringTemplate, WaitingBill } from '../api';
import { isMonthly, type Repeat } from '../schedule';
import { RECURRING_ERROR_MESSAGES } from '../errors';
import { useBillActions, useRecurringTemplates, useWaitingBills } from '../hooks';

const EVERY: Record<Repeat, string> = {
  daily: 'Every day',
  weekly: 'Every week',
  fortnightly: 'Every 2 weeks',
  monthly: 'Every month',
  quarterly: 'Every 3 months',
  yearly: 'Every year',
};

/** "Monday" for a YYYY-MM-DD date, in the device's locale. */
function weekday(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

/** "Every month on the 1st", "Every week on Monday" or "Every day", for a template's schedule. */
export function scheduleLabel(
  template: Pick<RecurringTemplate, 'repeat' | 'billDay' | 'nextBillDate'>,
): string {
  if (template.repeat === 'daily') return EVERY.daily;
  if (!isMonthly(template.repeat) || template.billDay === null) {
    return `${EVERY[template.repeat]} on ${weekday(template.nextBillDate)}`;
  }
  return `${EVERY[template.repeat]} on the ${ordinal(template.billDay)}`;
}

/**
 * The repeatable expenses tab of the apartment's settings, for admins: bills
 * waiting for them first, then every repeatable expense and a way to add one.
 */
export function RecurringSection({
  apartmentId,
  currency,
}: {
  apartmentId: string;
  currency: string;
}) {
  // Opening the tab answers the "a bill arrived" notifications.
  useMarkSeen(unreadMatches.recurring(apartmentId));

  return (
    <View className="gap-4">
      <WaitingBills apartmentId={apartmentId} />
      <Templates apartmentId={apartmentId} currency={currency} />
    </View>
  );
}

function WaitingBills({ apartmentId }: { apartmentId: string }) {
  const bills = useWaitingBills(apartmentId);
  const { skip } = useBillActions(apartmentId);

  if (bills.isLoadingError) {
    return (
      <LoadError
        message={userErrorMessage(bills.error, 'Could not load the bills waiting for you.')}
        onRetry={() => void bills.refetch()}
      />
    );
  }
  if (!bills.data || bills.data.length === 0) return null;

  const confirmSkip = (bill: WaitingBill) =>
    Alert.alert(
      `Skip ${bill.template.title} for ${formatDate(bill.billDate)}?`,
      'Nothing is charged for this period. Later periods carry on as usual.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', style: 'destructive', onPress: () => skip.mutate(bill.id) },
      ],
    );

  return (
    <Card testID="waiting-bills">
      <Card.Body className="gap-4">
        <Card.Title>Waiting for you</Card.Title>
        <FormAlert
          message={
            skip.error
              ? userErrorMessage(skip.error, 'Could not skip the bill.', RECURRING_ERROR_MESSAGES)
              : null
          }
        />
        {bills.data.map((bill, index) => (
          <View key={bill.id} className="gap-3">
            {index > 0 ? <Separator /> : null}
            <View className="gap-1">
              <Typography.Paragraph className="font-medium">
                {bill.template.title}, {formatDate(bill.billDate)}
              </Typography.Paragraph>
              <Typography.Paragraph type="body-sm" color="muted">
                {bill.reason === 'amount_needed'
                  ? 'The bill has arrived. Enter its amount to charge it.'
                  : 'Someone in its split has left. Check the split to charge it.'}
              </Typography.Paragraph>
            </View>
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                onPress={() =>
                  router.push({
                    pathname: '/apartments/[apartmentId]/recurring/bills/[instanceId]',
                    params: { apartmentId, instanceId: bill.id },
                  })
                }
              >
                {bill.reason === 'amount_needed' ? 'Enter amount' : 'Check split'}
              </Button>
              <OnlineButton
                variant="ghost"
                onPress={() => confirmSkip(bill)}
                isDisabled={skip.isPending}
              >
                Skip
              </OnlineButton>
            </View>
          </View>
        ))}
      </Card.Body>
    </Card>
  );
}

function Templates({ apartmentId, currency }: { apartmentId: string; currency: string }) {
  const templates = useRecurringTemplates(apartmentId);

  return (
    <View className="gap-3">
      {templates.isPending ? <LoadingRows count={2} /> : null}
      {templates.isLoadingError ? (
        <LoadError
          message={userErrorMessage(templates.error, 'Could not load the repeatable expenses.')}
          onRetry={() => void templates.refetch()}
        />
      ) : null}
      {templates.data?.length === 0 ? (
        <Typography.Paragraph type="body-sm" color="muted" className="text-center">
          No repeatable expenses yet. Add rent, internet or another bill that comes back.
        </Typography.Paragraph>
      ) : null}
      {templates.data?.map((template) => (
        <TemplateRow
          key={template.id}
          apartmentId={apartmentId}
          template={template}
          currency={currency}
        />
      ))}
      <OnlineButton
        variant="secondary"
        onPress={() =>
          router.push({
            pathname: '/apartments/[apartmentId]/recurring/new',
            params: { apartmentId },
          })
        }
      >
        Add repeatable expense
      </OnlineButton>
    </View>
  );
}

/** One repeatable expense, laid out like an expense on the home screen. Opens it to edit. */
function TemplateRow({
  apartmentId,
  template,
  currency,
}: {
  apartmentId: string;
  template: RecurringTemplate;
  currency: string;
}) {
  const amount =
    template.amountMinor === null
      ? 'Amount varies'
      : `${formatMinorUnits(template.amountMinor)} ${currency}`;
  const details = [
    scheduleLabel(template),
    template.isPaused ? undefined : `next ${formatDate(template.nextBillDate)}`,
  ].filter(Boolean);

  return (
    <PressableFeedback
      onPress={() =>
        router.push({
          pathname: '/apartments/[apartmentId]/recurring/[templateId]',
          params: { apartmentId, templateId: template.id },
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`${template.title}, ${amount}, ${details.join(', ')}${template.isPaused ? ', paused' : ''}`}
      accessibilityHint="Opens it to edit, pause or remove"
      className="rounded-3xl"
    >
      <Card>
        <Card.Body className="flex-row items-center gap-3">
          <View className="flex-1 gap-1">
            <Typography.Paragraph numberOfLines={1}>{template.title}</Typography.Paragraph>
            <Typography.Paragraph type="body-xs" color="muted" numberOfLines={1}>
              {details.join(' · ')}
            </Typography.Paragraph>
          </View>
          <View className="items-end gap-1">
            <Typography.Paragraph
              weight="semibold"
              color={template.amountMinor === null ? 'muted' : 'default'}
            >
              {amount}
            </Typography.Paragraph>
            {template.isPaused ? (
              <StatusChip size="sm" variant="soft" color="warning">
                Paused
              </StatusChip>
            ) : null}
          </View>
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
