import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { useApartment, useApartmentId } from '@/features/apartments/hooks';
import { Dashboard } from '@/features/expenses/components/dashboard';
import { userErrorMessage } from '@/lib/errors';

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

  return <Dashboard apartment={apartment.data} />;
}
