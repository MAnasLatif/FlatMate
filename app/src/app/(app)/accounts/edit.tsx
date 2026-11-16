import { useLocalSearchParams } from 'expo-router';

import { EditAccount } from '@/features/accounts/components/edit-account';

export default function EditAccountScreen() {
  const { accountId } = useLocalSearchParams<{ accountId?: string }>();
  return <EditAccount accountId={typeof accountId === 'string' ? accountId : null} />;
}
