import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Skeleton } from 'heroui-native';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { userErrorMessage } from '@/lib/errors';
import {
  createSignedImageUrl,
  type PrivateImageBucket,
  SIGNED_URL_STALE_TIME_MS,
} from '@/lib/private-images';

import { LoadError } from './query-states';

/** A temporary link to a private photo, refreshed before it expires. */
function useSignedImageUrl(bucket: PrivateImageBucket, path: string) {
  return useQuery({
    queryKey: ['signed-image-url', bucket, path],
    queryFn: () => createSignedImageUrl(bucket, path),
    staleTime: SIGNED_URL_STALE_TIME_MS,
  });
}

/** A small square of a private photo that opens it. */
export function PrivateImageThumbnail({
  bucket,
  path,
  label,
  onPress,
}: {
  bucket: PrivateImageBucket;
  path: string;
  label: string;
  onPress: () => void;
}) {
  const url = useSignedImageUrl(bucket, path);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="size-24 overflow-hidden rounded-xl bg-default"
    >
      {url.data ? (
        <Image source={{ uri: url.data }} style={{ flex: 1 }} contentFit="cover" />
      ) : url.isPending ? (
        <Skeleton className="flex-1" />
      ) : null}
    </Pressable>
  );
}

/** One private photo at full size, fitted to the space it is given. */
export function PrivateImageView({ bucket, path }: { bucket: PrivateImageBucket; path: string }) {
  const url = useSignedImageUrl(bucket, path);
  const [imageFailed, setImageFailed] = useState(false);

  if (url.isPending) {
    return <Skeleton className="flex-1 rounded-xl" accessibilityLabel="Loading photo" />;
  }
  if (url.error || imageFailed) {
    return (
      <LoadError
        message={userErrorMessage(url.error, 'Could not show the photo.')}
        onRetry={() => {
          setImageFailed(false);
          void url.refetch();
        }}
      />
    );
  }
  return (
    <Image
      source={{ uri: url.data }}
      style={{ flex: 1 }}
      contentFit="contain"
      accessibilityLabel="Photo"
      onError={() => setImageFailed(true)}
    />
  );
}
