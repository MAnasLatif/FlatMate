import { router, useLocalSearchParams } from 'expo-router';
import { Button } from 'heroui-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormAlert } from '@/components/form/form-alert';
import { PrivateImageView } from '@/components/private-image';
import { useApartmentId } from '@/features/apartments/hooks';
import { isPrivateImageBucket } from '@/lib/private-images';

/** A receipt or a piece of dispute evidence at full size. */
export default function PhotoScreen() {
  const apartmentId = useApartmentId();
  const { bucket, path } = useLocalSearchParams<{ bucket?: string; path?: string }>();
  const insets = useSafeAreaInsets();
  // Storage only serves photos to people allowed to see them, so this only catches a malformed link.
  const isValid =
    isPrivateImageBucket(bucket) && typeof path === 'string' && path.startsWith(`${apartmentId}/`);

  return (
    <View className="flex-1 gap-4 bg-background p-4" style={{ paddingBottom: insets.bottom + 16 }}>
      {isValid ? (
        <PrivateImageView bucket={bucket} path={path} />
      ) : (
        <>
          <FormAlert message="This photo link is incomplete." />
          <Button variant="secondary" onPress={() => router.back()}>
            Go back
          </Button>
        </>
      )}
    </View>
  );
}
