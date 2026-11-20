import { Card, Typography } from 'heroui-native';
import { View } from 'react-native';

import { LoadError } from '@/components/query-states';
import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

import { useCancelJoinRequest, useMyJoinRequests } from '../hooks';

/**
 * The user's requests to join apartments that are waiting for an admin, each
 * with a way to cancel it. Nothing shows when there are none.
 */
export function MyJoinRequests() {
  const requests = useMyJoinRequests();
  const cancel = useCancelJoinRequest();

  // A failed load says so instead of looking like there is nothing to show.
  if (requests.isLoadingError) {
    return (
      <LoadError
        message="Could not load your requests to join."
        onRetry={() => void requests.refetch()}
      />
    );
  }
  if (!requests.data || requests.data.length === 0) return null;

  return (
    <View className="gap-3">
      <FormAlert
        message={cancel.error ? userErrorMessage(cancel.error, 'Could not cancel it.') : null}
      />
      {requests.data.map((request) => (
        <Card key={request.id}>
          <Card.Body className="flex-row items-center gap-3">
            <View className="flex-1 gap-0.5">
              <Typography.Paragraph>{request.apartmentName}</Typography.Paragraph>
              <Typography.Paragraph type="body-xs" color="muted">
                Waiting for an admin to let you in · asked {formatDate(request.createdAt)}
              </Typography.Paragraph>
            </View>
            <OnlineButton
              size="sm"
              variant="ghost"
              isDisabled={cancel.isPending}
              onPress={() => cancel.mutate(request.id)}
              accessibilityLabel={`Cancel your request to join ${request.apartmentName}`}
            >
              Cancel
            </OnlineButton>
          </Card.Body>
        </Card>
      ))}
    </View>
  );
}
