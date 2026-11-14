import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import {
  BottomSheet,
  Button,
  Label,
  PressableFeedback,
  Typography,
  useThemeColor,
} from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { type ImageSource, type PickedImage, pickImage } from '@/lib/private-images';

/**
 * Photos of a bill's receipts, as many as it has, picked before saving. Each
 * can be taken off again until the expense is saved; once saved they stay.
 */
export function ReceiptsField({
  receipts,
  onChange,
  isDisabled = false,
}: {
  receipts: PickedImage[];
  onChange: (receipts: PickedImage[]) => void;
  isDisabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isChoosing, setChoosing] = useState(false);
  const [accent, foreground] = useThemeColor(['accent', 'foreground']);

  const add = async (source: ImageSource) => {
    setChoosing(false);
    const result = await pickImage(source);
    if (!result) return;
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    onChange([...receipts, result.image]);
  };

  return (
    <View className="gap-2">
      <Label>Receipts (optional)</Label>
      {receipts.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {receipts.map((receipt, index) => (
            <View key={receipt.uri} className="size-20 overflow-hidden rounded-xl bg-default">
              <Image
                source={{ uri: receipt.uri }}
                style={{ flex: 1 }}
                contentFit="cover"
                accessibilityLabel={`Receipt ${index + 1}`}
              />
              <PressableFeedback
                onPress={() => onChange(receipts.filter((_, other) => other !== index))}
                isDisabled={isDisabled}
                accessibilityRole="button"
                accessibilityLabel={`Remove receipt ${index + 1}`}
                hitSlop={8}
                className="absolute right-1 top-1 size-6 items-center justify-center rounded-full bg-background/80"
              >
                <Ionicons name="close" size={14} color={foreground} />
              </PressableFeedback>
            </View>
          ))}
        </View>
      ) : null}
      <FormAlert message={error} />
      <View className="flex-row">
        <Button
          size="sm"
          variant="secondary"
          onPress={() => setChoosing(true)}
          isDisabled={isDisabled}
        >
          <Ionicons name="camera-outline" size={16} color={accent} />
          <Button.Label>
            {receipts.length > 0 ? 'Add another receipt' : 'Add a receipt'}
          </Button.Label>
        </Button>
      </View>
      <Typography.Paragraph type="body-xs" color="muted">
        Photos your flatmates can check. They cannot be removed once saved.
      </Typography.Paragraph>

      <BottomSheet isOpen={isChoosing} onOpenChange={setChoosing}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content>
            <View className="gap-6">
              <BottomSheet.Title>Add a receipt</BottomSheet.Title>
              <View className="gap-3">
                <Button variant="secondary" onPress={() => void add('camera')}>
                  <Ionicons name="camera-outline" size={18} color={accent} />
                  <Button.Label>Take a photo</Button.Label>
                </Button>
                <Button variant="secondary" onPress={() => void add('library')}>
                  <Ionicons name="images-outline" size={18} color={accent} />
                  <Button.Label>Choose from gallery</Button.Label>
                </Button>
              </View>
            </View>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </View>
  );
}
