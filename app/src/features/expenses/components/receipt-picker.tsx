import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, Typography } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { randomUuid } from '@/lib/uuid';

import { type PickedReceipt, RECEIPT_MAX_BYTES, RECEIPT_MIME_TYPES } from '../api';

type ReceiptPickerProps = {
  receipt: PickedReceipt | null;
  onChange: (receipt: PickedReceipt | null) => void;
  isDisabled?: boolean;
};

/** Attaches one photo of a receipt from the device's library, checked against the bucket limits. */
export function ReceiptPicker({ receipt, onChange, isDisabled = false }: ReceiptPickerProps) {
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;

    const mimeType = asset.mimeType ?? 'image/jpeg';
    if (!RECEIPT_MIME_TYPES.includes(mimeType)) {
      setError('Choose a JPEG, PNG or WebP photo.');
    } else if (asset.fileSize !== undefined && asset.fileSize > RECEIPT_MAX_BYTES) {
      setError('This photo is too large. Choose one under 10 MB.');
    } else {
      setError(null);
      onChange({ id: randomUuid(), uri: asset.uri, mimeType });
    }
  };

  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>Receipt</Card.Title>
        <Typography.Paragraph type="body-xs" color="muted">
          Optional. A photo your flatmates can check. It cannot be removed once saved.
        </Typography.Paragraph>
        {receipt ? (
          <View className="h-48 overflow-hidden rounded-xl">
            <Image
              source={{ uri: receipt.uri }}
              style={{ flex: 1 }}
              contentFit="contain"
              accessibilityLabel="Attached receipt"
            />
          </View>
        ) : null}
        <FormAlert message={error} />
        <View className="flex-row gap-2">
          <Button size="sm" variant="secondary" onPress={() => void pick()} isDisabled={isDisabled}>
            {receipt ? 'Choose another photo' : 'Attach receipt'}
          </Button>
          {receipt ? (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => onChange(null)}
              isDisabled={isDisabled}
            >
              Remove
            </Button>
          ) : null}
        </View>
      </Card.Body>
    </Card>
  );
}
