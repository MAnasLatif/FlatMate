import { router } from 'expo-router';
import { Skeleton, Typography } from 'heroui-native';
import { View } from 'react-native';

import { PrivateImageThumbnail } from '@/components/private-image';
import { LoadError } from '@/components/query-states';
import { userErrorMessage } from '@/lib/errors';

import { useAttachments } from '../hooks';

/** The receipts of an expense as thumbnails. Tapping one opens it in the photo viewer. */
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
        <PrivateImageThumbnail
          key={attachment.id}
          bucket="receipts"
          path={attachment.storage_path}
          label={`Open receipt ${index + 1}`}
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/photo',
              params: { apartmentId, bucket: 'receipts', path: attachment.storage_path },
            })
          }
        />
      ))}
    </View>
  );
}
