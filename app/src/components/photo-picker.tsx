import { Image } from 'expo-image';
import { Button, Card, Typography } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type PickedImage, pickImage } from '@/lib/private-images';

import { FormAlert } from './form/form-alert';

type PhotoPickerProps = {
  title: string;
  description: string;
  /** What the button says when no photo is chosen yet, such as "Attach receipt". */
  attachLabel: string;
  image: PickedImage | null;
  onChange: (image: PickedImage | null) => void;
  isDisabled?: boolean;
};

/** Attaches one photo from the device's library, checked against the bucket limits. */
export function PhotoPicker({
  title,
  description,
  attachLabel,
  image,
  onChange,
  isDisabled = false,
}: PhotoPickerProps) {
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    const result = await pickImage();
    if (!result) return;
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    onChange(result.image);
  };

  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>{title}</Card.Title>
        <Typography.Paragraph type="body-xs" color="muted">
          {description}
        </Typography.Paragraph>
        {image ? (
          <View className="h-48 overflow-hidden rounded-xl">
            <Image
              source={{ uri: image.uri }}
              style={{ flex: 1 }}
              contentFit="contain"
              accessibilityLabel={`Chosen photo for ${title.toLowerCase()}`}
            />
          </View>
        ) : null}
        <FormAlert message={error} />
        <View className="flex-row gap-2">
          <Button size="sm" variant="secondary" onPress={() => void pick()} isDisabled={isDisabled}>
            {image ? 'Choose another photo' : attachLabel}
          </Button>
          {image ? (
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
