import { useLocalSearchParams } from 'expo-router';
import Stack from 'expo-router/stack';

import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { SharedAccounts } from '@/features/accounts/components/shared-accounts';
import { useApartment, useApartmentId, useMembers } from '@/features/apartments/hooks';
import { PairLedger } from '@/features/expenses/components/pair-ledger';
import { PairPayments } from '@/features/payments/components/pair-payments';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { userErrorMessage } from '@/lib/errors';

export default function PairLedgerScreen() {
  const apartmentId = useApartmentId();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  useMarkSeen(unreadMatches.ledgerWith(apartmentId, memberId));
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);

  if (apartment.isPending || members.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  if (apartment.isLoadingError || members.isLoadingError) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(
            apartment.error ?? members.error,
            'Could not load this member.',
          )}
          onRetry={() => {
            void apartment.refetch();
            void members.refetch();
          }}
        />
      </Screen>
    );
  }

  const name =
    members.data.find((member) => member.userId === memberId)?.displayName ?? 'This member';
  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <PairLedger
        apartmentId={apartmentId}
        counterpartyId={memberId}
        name={name}
        currency={apartment.data.currency}
      >
        <PairPayments apartmentId={apartmentId} counterpartyId={memberId} name={name} />
        <SharedAccounts apartmentId={apartmentId} userId={memberId} name={name} />
      </PairLedger>
    </>
  );
}
