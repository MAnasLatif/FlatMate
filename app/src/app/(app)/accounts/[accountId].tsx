import { useLocalSearchParams } from 'expo-router';

import { AccountDetails } from '@/features/accounts/components/account-details';

export default function AccountDetailsScreen() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  return <AccountDetails accountId={accountId} />;
}
