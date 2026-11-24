import { Card, Separator, Typography } from 'heroui-native';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { useApartment, useMyMembership } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { userErrorMessage } from '@/lib/errors';

import type { StatementPeriod } from '../api';
import { periodLabel } from '../document';
import type { ExportRequest } from '../export';
import { useExportPdf, useStatementPeriods } from '../hooks';

const EXPORT_ERRORS: Record<string, string> = {
  sharing_unavailable: 'This device cannot share files, so the PDF cannot be opened here.',
  not_admin: 'Only admins of this apartment can export its report.',
  not_member: 'You can no longer see this apartment.',
  period_not_found: 'This period is no longer available.',
};

/**
 * The settlement periods, newest first, each with the user's statement as a
 * PDF and, for admins, the apartment report (FR-10.2, AC-14). The PDF is made
 * on the phone and opened in the share sheet.
 */
export function StatementsList({ apartmentId }: { apartmentId: string }) {
  const userId = useCurrentUserId();
  const apartment = useApartment(apartmentId);
  const periods = useStatementPeriods(apartmentId);
  const isAdmin = useMyMembership(apartmentId)?.role === 'admin';
  const exportPdf = useExportPdf();

  if (apartment.isPending || periods.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  const loadError = apartment.error ?? periods.error;
  if (loadError || !apartment.data || !periods.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load the statements.')}
          onRetry={() => {
            void apartment.refetch();
            void periods.refetch();
          }}
        />
      </Screen>
    );
  }

  const start = (kind: ExportRequest['kind'], period: StatementPeriod) =>
    exportPdf.mutate({
      kind,
      apartmentId,
      apartmentName: apartment.data.name,
      currency: apartment.data.currency,
      periodId: period.id,
      userId,
    });
  const isBusy = (kind: ExportRequest['kind'], period: StatementPeriod) =>
    exportPdf.isPending &&
    exportPdf.variables?.kind === kind &&
    exportPdf.variables.periodId === period.id;

  return (
    <Screen freshness={periods} padTop={false}>
      <Typography.Paragraph type="body-sm" color="muted">
        Each statement covers one settlement period: your share of its expenses, payments, what was
        carried forward, and what you owe and are owed.
        {isAdmin ? ' As an admin you can also export the apartment report.' : ''}
      </Typography.Paragraph>
      <FormAlert
        message={
          exportPdf.error
            ? userErrorMessage(exportPdf.error, 'Could not make the PDF.', EXPORT_ERRORS)
            : null
        }
      />
      <Card>
        <Card.Body className="gap-3">
          {periods.data.length === 0 ? (
            <Typography.Paragraph type="body-sm" color="muted">
              No settlement period has started yet.
            </Typography.Paragraph>
          ) : null}
          {periods.data.map((period, index) => (
            <View key={period.id} className="gap-3">
              {index > 0 ? <Separator /> : null}
              <View className="gap-1">
                <Typography.Paragraph weight="semibold">{periodLabel(period)}</Typography.Paragraph>
                <Typography.Paragraph type="body-xs" color="muted">
                  {period.state === 'open'
                    ? 'Open: figures so far, which can still change'
                    : 'Closed: final figures'}
                </Typography.Paragraph>
              </View>
              <View className="flex-row gap-3">
                <OnlineButton
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  isDisabled={exportPdf.isPending}
                  onPress={() => start('statement', period)}
                  accessibilityLabel={`My statement, ${periodLabel(period)}`}
                >
                  {isBusy('statement', period) ? 'Preparing…' : 'My statement'}
                </OnlineButton>
                {isAdmin ? (
                  <OnlineButton
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    isDisabled={exportPdf.isPending}
                    onPress={() => start('report', period)}
                    accessibilityLabel={`Apartment report, ${periodLabel(period)}`}
                  >
                    {isBusy('report', period) ? 'Preparing…' : 'Apartment report'}
                  </OnlineButton>
                ) : null}
              </View>
            </View>
          ))}
        </Card.Body>
      </Card>
    </Screen>
  );
}
