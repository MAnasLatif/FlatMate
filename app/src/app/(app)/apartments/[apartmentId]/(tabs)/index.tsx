import { Card, Typography } from 'heroui-native';
import { View } from 'react-native';

import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { useApartment, useApartmentId } from '@/features/apartments/hooks';
import { userErrorMessage } from '@/lib/errors';
import { ordinal } from '@/lib/time';

export default function ApartmentDashboard() {
  const apartmentId = useApartmentId();
  const apartment = useApartment(apartmentId);

  if (apartment.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={2} />
      </Screen>
    );
  }

  if (apartment.isError) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(apartment.error, 'Could not load this apartment.')}
          onRetry={() => void apartment.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen
      padTop={false}
      refreshing={apartment.isRefetching}
      onRefresh={() => void apartment.refetch()}
    >
      <Card>
        <Card.Body className="gap-1">
          <Typography.Paragraph type="body-sm" color="muted">
            Balances settle on the {ordinal(apartment.data.settlement_day)} of each month, in{' '}
            {apartment.data.currency}.
          </Typography.Paragraph>
        </Card.Body>
      </Card>
      <View className="flex-1 items-center justify-center gap-2 py-10">
        <Typography.Heading type="h4" className="text-center">
          No expenses yet
        </Typography.Heading>
        <Typography.Paragraph color="muted" className="text-center">
          Shared costs you and your flatmates add will appear here.
        </Typography.Paragraph>
      </View>
    </Screen>
  );
}
