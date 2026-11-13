import { router, useLocalSearchParams } from 'expo-router';
import { Button } from 'heroui-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormAlert } from '@/components/form/form-alert';
import { useApartmentId } from '@/features/apartments/hooks';
import { ReceiptView } from '@/features/expenses/components/expense-receipts';

export default function ReceiptScreen() {
  const apartmentId = useApartmentId();
  const { path } = useLocalSearchParams<{ path?: string }>();
  const insets = useSafeAreaInsets();
  // Storage only serves receipts to members, so this check only catches a malformed link.
  const isValid = typeof path === 'string' && path.startsWith(`${apartmentId}/`);

  return (
    <View className="flex-1 gap-4 bg-background p-4" style={{ paddingBottom: insets.bottom + 16 }}>
      {isValid ? (
        <ReceiptView path={path} />
      ) : (
        <>
          <FormAlert message="This receipt link is incomplete." />
          <Button variant="secondary" onPress={() => router.back()}>
            Go back
          </Button>
        </>
      )}
    </View>
  );
}
