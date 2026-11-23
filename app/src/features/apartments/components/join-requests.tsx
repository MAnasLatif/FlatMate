import { Card, Typography } from 'heroui-native';
import { View } from 'react-native';

import { LoadError } from '@/components/query-states';
import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { ProfileAvatar } from '@/features/profile/components/profile-avatar';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

import { useDecideJoinRequest, useJoinRequests } from '../hooks';

const DECIDE_ERRORS: Record<string, string> = {
  request_not_pending: 'Another admin already answered this request.',
  request_not_found: 'This request is no longer available.',
};

/**
 * People asking to join, for the apartment's admins to let in or turn away.
 * Any admin can answer; the first answer counts. Nothing shows when nobody is asking.
 */
export function JoinRequests({ apartmentId }: { apartmentId: string }) {
  const requests = useJoinRequests(apartmentId, true);
  const decide = useDecideJoinRequest(apartmentId);

  // A failed load says so instead of looking like there is nothing to show.
  if (requests.isLoadingError) {
    return (
      <LoadError
        message="Could not load who is asking to join."
        onRetry={() => void requests.refetch()}
      />
    );
  }
  if (!requests.data || requests.data.length === 0) return null;

  return (
    <View className="gap-3">
      <Typography.Heading type="h6">Asking to join</Typography.Heading>
      <FormAlert
        message={
          decide.error
            ? userErrorMessage(decide.error, 'Could not answer the request.', DECIDE_ERRORS)
            : null
        }
      />
      {requests.data.map((request) => {
        const name = request.displayName ?? 'Someone';
        return (
          <Card key={request.id}>
            <Card.Body className="gap-3">
              <View className="flex-row items-center gap-3">
                <ProfileAvatar
                  name={request.displayName}
                  avatarPath={request.avatarPath}
                  size="sm"
                />
                <View className="flex-1">
                  <Typography.Paragraph>{name}</Typography.Paragraph>
                  <Typography.Paragraph type="body-xs" color="muted">
                    Asked {formatDate(request.createdAt)}
                  </Typography.Paragraph>
                </View>
              </View>
              <View className="flex-row gap-2">
                <OnlineButton
                  size="sm"
                  className="flex-1"
                  isDisabled={decide.isPending}
                  onPress={() => decide.mutate({ requestId: request.id, approve: true })}
                  accessibilityLabel={`Let ${name} in`}
                >
                  Let in
                </OnlineButton>
                <OnlineButton
                  size="sm"
                  variant="danger-soft"
                  className="flex-1"
                  isDisabled={decide.isPending}
                  onPress={() => decide.mutate({ requestId: request.id, approve: false })}
                  accessibilityLabel={`Decline ${name}`}
                >
                  Decline
                </OnlineButton>
              </View>
            </Card.Body>
          </Card>
        );
      })}
    </View>
  );
}
