import { useLocalSearchParams } from 'expo-router';

import { AccountDetails } from '@/features/accounts/components/account-details';
import { AccountPayments } from '@/features/payments/components/account-payments';

export default function AccountDetailsScreen() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  // Composed here so the accounts feature does not depend on payments, which
  // already depends on accounts.
  return (
    <AccountDetails accountId={accountId}>
      <AccountPayments accountId={accountId} />
    </AccountDetails>
  );
}
