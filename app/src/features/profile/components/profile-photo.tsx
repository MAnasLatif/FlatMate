import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { BottomSheet, Button, PressableFeedback, Spinner, useThemeColor } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { Sheet } from '@/components/sheet';
import { userErrorMessage } from '@/lib/errors';
import { useIsOnline } from '@/lib/network';

import { avatarUploadErrorMessage } from '../errors';
import { useRemoveAvatar, useUploadAvatar } from '../hooks';
import { ProfileAvatar } from './profile-avatar';

/**
 * The profile photo. Tapping it picks a photo; when there is one already, a
 * sheet offers to change or remove it. The camera badge shows it is editable.
 */
export function ProfilePhoto({
  userId,
  name,
  avatarPath,
}: {
  userId: string;
  name: string | null;
  avatarPath: string | null;
}) {
  const upload = useUploadAvatar(userId);
  const remove = useRemoveAvatar(userId);
  const isOnline = useIsOnline();
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [accent, accentForeground, background, danger] = useThemeColor([
    'accent',
    'accent-foreground',
    'background',
    'danger',
  ]);
  const isBusy = upload.isPending || remove.isPending;
  const isDisabled = isBusy || !isOnline;

  const pickPhoto = async () => {
    setSheetOpen(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset) {
      upload.mutate({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
    }
  };

  const removePhoto = () => {
    setSheetOpen(false);
    remove.mutate();
  };

  const error = upload.error
    ? avatarUploadErrorMessage(upload.error)
    : remove.error
      ? userErrorMessage(remove.error, 'Could not remove your photo.')
      : null;

  return (
    <View className="items-center gap-3">
      <PressableFeedback
        onPress={() => (avatarPath ? setSheetOpen(true) : void pickPhoto())}
        isDisabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={avatarPath ? 'Change or remove your photo' : 'Add a photo'}
        accessibilityState={{ disabled: isDisabled, busy: isBusy }}
      >
        <ProfileAvatar name={name} avatarPath={avatarPath} size="xl" />
        {isBusy ? (
          <View className="absolute inset-0 items-center justify-center rounded-4xl bg-black/40">
            <Spinner accessibilityLabel={upload.isPending ? 'Uploading photo' : 'Removing photo'} />
          </View>
        ) : null}
        <View
          className="absolute bottom-0 right-0 size-9 items-center justify-center rounded-full border-2"
          style={{ backgroundColor: accent, borderColor: background }}
        >
          <Ionicons name="camera" size={16} color={accentForeground} />
        </View>
      </PressableFeedback>
      <FormAlert message={error} />

      <Sheet isOpen={isSheetOpen} onOpenChange={setSheetOpen}>
        <BottomSheet.Content>
          <View className="gap-6">
            <BottomSheet.Title>Profile photo</BottomSheet.Title>
            <View className="gap-3">
              <Button variant="secondary" onPress={() => void pickPhoto()}>
                <Ionicons
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  name="image-outline"
                  size={18}
                  color={accent}
                />
                <Button.Label>Choose a new photo</Button.Label>
              </Button>
              <Button variant="danger-soft" onPress={removePhoto}>
                <Ionicons
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  name="trash-outline"
                  size={18}
                  color={danger}
                />
                <Button.Label>Remove photo</Button.Label>
              </Button>
            </View>
          </View>
        </BottomSheet.Content>
      </Sheet>
    </View>
  );
}
