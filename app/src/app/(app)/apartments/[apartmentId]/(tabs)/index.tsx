import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { useApartment, useApartmentId } from '@/features/apartments/hooks';
import { Dashboard } from '@/features/expenses/components/dashboard';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { userErrorMessage } from '@/lib/errors';

export default function ApartmentDashboard() {
  const apartmentId = useApartmentId();
  const apartment = useApartment(apartmentId);
  // Such as being let in: the dashboard is where it opens.
  useMarkSeen(unreadMatches.apartment(apartmentId));

  if (apartment.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={2} />
      </Screen>
    );
  }

  if (apartment.isLoadingError) {
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
