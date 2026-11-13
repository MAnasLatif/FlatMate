import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Skeleton, Typography } from 'heroui-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { LoadError } from '@/components/query-states';
import { userErrorMessage } from '@/lib/errors';

import { useAttachments, useReceiptUrl } from '../hooks';

/** The receipts of an expense as thumbnails. Tapping one opens it in the receipt viewer. */
export function ExpenseReceipts({
  apartmentId,
  expenseId,
}: {
  apartmentId: string;
  expenseId: string;
}) {
  const attachments = useAttachments(apartmentId, expenseId);

  if (attachments.isPending) {
    return <Skeleton className="size-24 rounded-xl" accessibilityLabel="Loading receipts" />;
  }
  if (attachments.error) {
    return (
      <LoadError
        message={userErrorMessage(attachments.error, 'Could not load the receipts.')}
        onRetry={() => void attachments.refetch()}
      />
    );
  }
  if (attachments.data.length === 0) {
    return (
      <Typography.Paragraph type="body-sm" color="muted">
        No receipt attached.
      </Typography.Paragraph>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      {attachments.data.map((attachment, index) => (
        <ReceiptThumbnail
          key={attachment.id}
          path={attachment.storage_path}
          label={`Open receipt ${index + 1}`}
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/receipt',
              params: { apartmentId, path: attachment.storage_path },
            })
          }
        />
      ))}
    </View>
  );
}

function ReceiptThumbnail({
  path,
  label,
  onPress,
}: {
  path: string;
  label: string;
  onPress: () => void;
}) {
  const url = useReceiptUrl(path);
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

/** One receipt at full size, fitted to the space it is given. */
export function ReceiptView({ path }: { path: string }) {
  const url = useReceiptUrl(path);
  const [imageFailed, setImageFailed] = useState(false);

  if (url.isPending) {
    return <Skeleton className="flex-1 rounded-xl" accessibilityLabel="Loading receipt" />;
  }
  if (url.error || imageFailed) {
    return (
      <LoadError
        message={userErrorMessage(url.error, 'Could not show the receipt.')}
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
      accessibilityLabel="Receipt photo"
      onError={() => setImageFailed(true)}
    />
  );
}
