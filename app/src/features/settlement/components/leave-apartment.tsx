import { router } from 'expo-router';
import { Button, Card, Separator, Typography } from 'heroui-native';
import { Alert, View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { APARTMENT_ERROR_MESSAGES } from '@/features/apartments/errors';
import { useApartment, useLeaveApartment } from '@/features/apartments/hooks';
import { userErrorMessage } from '@/lib/errors';
import { formatMinorUnits } from '@/lib/money';

import { useSettlementPreview } from '../hooks';
import { useNameOf } from '../names';

/**
 * Leaving an apartment, after showing what the user still owes and is owed
 * (SRS FR-02.4). Leaving changes none of it; the user can still settle later.
 */
export function LeaveApartment({ apartmentId }: { apartmentId: string }) {
  const apartment = useApartment(apartmentId);
  const preview = useSettlementPreview(apartmentId);
  const leave = useLeaveApartment(apartmentId);
  const nameOf = useNameOf(apartmentId, preview.data?.rows.map((row) => row.counterpartyId) ?? []);

  if (apartment.isPending || preview.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  const loadError = apartment.error ?? preview.error;
  if (loadError || !apartment.data || !preview.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load your balances.')}
          onRetry={() => {
            void apartment.refetch();
            void preview.refetch();
          }}
        />
      </Screen>
    );
  }

  const money = (amountMinor: number) =>
    `${formatMinorUnits(amountMinor)} ${apartment.data.currency}`;
  const rows = preview.data.rows;
  const confirm = () =>
    Alert.alert(`Leave ${apartment.data.name}?`, 'You will lose access to its current expenses.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => leave.mutate(undefined, { onSuccess: () => router.dismissTo('/') }),
      },
    ]);

  return (
    <Screen padTop={false}>
      <Typography.Paragraph type="body-sm" color="muted">
        Leaving keeps every record. What you owe and are owed stays as it is, and you can still pay
        it later from Past apartments on the home screen.
      </Typography.Paragraph>
      <Card>
        <Card.Body className="gap-3">
          <Card.Title>When you leave</Card.Title>
          {rows.length === 0 ? (
            <Typography.Paragraph type="body-sm">
              You are square with everyone, so there is nothing to settle.
            </Typography.Paragraph>
          ) : (
            rows.map((row, index) => {
              const net = row.owedMinor - row.oweMinor;
              const held = row.heldOweMinor + row.heldOwedMinor;
              const name = nameOf(row.counterpartyId);
              return (
                <View key={row.counterpartyId} className="gap-1">
                  {index > 0 ? <Separator /> : null}
                  <Typography.Paragraph type="body-sm" weight="semibold">
                    {net > 0
                      ? `${name} still owes you ${money(net)}`
                      : net < 0
                        ? `You still owe ${name} ${money(-net)}`
                        : `You and ${name} are square`}
                  </Typography.Paragraph>
                  {held !== 0 ? (
                    <Typography.Paragraph type="body-xs" color="muted">
                      {money(Math.abs(held))} is held by disputes that stay open after you leave.
                    </Typography.Paragraph>
                  ) : null}
                </View>
              );
            })
          )}
        </Card.Body>
      </Card>
      {rows.length > 0 ? (
        <Button
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/settlement',
              params: { apartmentId },
            })
          }
        >
          Settle up first
        </Button>
      ) : null}
      <FormAlert
        message={
          leave.error
            ? userErrorMessage(
                leave.error,
                'Could not leave the apartment.',
                APARTMENT_ERROR_MESSAGES,
              )
            : null
        }
      />
      <Button variant="danger-soft" onPress={confirm} isDisabled={leave.isPending}>
        {leave.isPending ? 'Leaving…' : 'Leave apartment'}
      </Button>
    </Screen>
  );
}
