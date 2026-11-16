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
import { billDateIn } from '../draft';
import { RECURRING_ERROR_MESSAGES } from '../errors';
import { useBillActions, useRecurringTemplates, useWaitingBills } from '../hooks';

const EVERY: Record<RecurringTemplate['intervalMonths'], string> = {
  1: 'Every month',
  3: 'Every 3 months',
  12: 'Every year',
};

/** "Every month on the 1st", for a template's schedule. */
export function scheduleLabel(template: Pick<RecurringTemplate, 'intervalMonths' | 'billDay'>) {
  return `${EVERY[template.intervalMonths]} on the ${ordinal(template.billDay)}`;
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
    <Card>
      <Card.Body className="gap-4">
        <Card.Title>Repeatable expenses</Card.Title>
        <Card.Description>
          Rent, internet, utilities and other bills that come back. A fixed amount is added as a
          bill on its day; for an amount that changes, admins are asked to enter it.
        </Card.Description>
        {templates.isPending ? <LoadingRows count={2} /> : null}
        {templates.isLoadingError ? (
          <LoadError
            message={userErrorMessage(templates.error, 'Could not load the repeatable expenses.')}
            onRetry={() => void templates.refetch()}
          />
        ) : null}
        {templates.data?.length === 0 ? (
          <Typography.Paragraph type="body-sm" color="muted">
            None yet. Add rent, internet or another bill that repeats.
          </Typography.Paragraph>
        ) : null}
        {templates.data?.map((template, index) => (
          <View key={template.id} className="gap-3">
            {index > 0 ? <Separator /> : null}
            <TemplateRow apartmentId={apartmentId} template={template} currency={currency} />
          </View>
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
      </Card.Body>
    </Card>
  );
}

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
      ? 'Amount entered each time'
      : `${formatMinorUnits(template.amountMinor)} ${currency}`;
  const next = template.isPaused
    ? 'Paused'
    : `Next: ${formatDate(billDateIn(template.nextPeriod, template.billDay))}`;

  return (
    <PressableFeedback
      onPress={() =>
        router.push({
          pathname: '/apartments/[apartmentId]/recurring/[templateId]',
          params: { apartmentId, templateId: template.id },
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`${template.title}, ${amount}, ${scheduleLabel(template)}. ${next}`}
      accessibilityHint="Opens it to edit, pause or remove"
    >
      <View className="flex-row items-center gap-3 py-1">
        <View className="flex-1 gap-1">
          <Typography.Paragraph className="font-medium">{template.title}</Typography.Paragraph>
          <Typography.Paragraph type="body-sm" color="muted">
            {amount} · {scheduleLabel(template)}
          </Typography.Paragraph>
          <Typography.Paragraph type="body-xs" color="muted">
            {next}
          </Typography.Paragraph>
        </View>
        {template.isPaused ? (
          <StatusChip size="sm" variant="soft" color="warning">
            Paused
          </StatusChip>
        ) : null}
      </View>
    </PressableFeedback>
  );
}
