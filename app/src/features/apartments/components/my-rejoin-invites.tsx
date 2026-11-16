import { router } from 'expo-router';
import { Card, Typography } from 'heroui-native';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

import { REJOIN_ERROR_MESSAGES } from '../errors';
import { useAnswerRejoinInvite, useMyRejoinInvites } from '../hooks';

/**
 * Invitations from an admin to come back to an apartment the user left, each
 * with Accept and Decline. Accepting makes them a member again and opens the
 * apartment. Nothing shows when there are none.
 */
export function MyRejoinInvites() {
  const invites = useMyRejoinInvites();
  const answer = useAnswerRejoinInvite();

  if (!invites.data || invites.data.length === 0) return null;

  return (
    <View className="gap-3">
      <FormAlert
        message={
          answer.error
            ? userErrorMessage(
                answer.error,
                'Could not answer the invitation.',
                REJOIN_ERROR_MESSAGES,
              )
            : null
        }
      />
      {invites.data.map((invite) => (
        <Card key={invite.id}>
          <Card.Body className="gap-3">
            <View className="gap-0.5">
              <Typography.Paragraph>
                {invite.invitedByName ?? 'An admin'} invited you back to {invite.apartmentName}
              </Typography.Paragraph>
              <Typography.Paragraph type="body-xs" color="muted">
                Invited {formatDate(invite.createdAt)}
              </Typography.Paragraph>
            </View>
            <View className="flex-row gap-2">
              <OnlineButton
                size="sm"
                className="flex-1"
                isDisabled={answer.isPending}
                onPress={() =>
                  answer.mutate(
                    { inviteId: invite.id, accept: true },
                    {
                      onSuccess: (apartmentId) =>
                        router.replace({
                          pathname: '/apartments/[apartmentId]',
                          params: { apartmentId },
                        }),
                    },
                  )
                }
                accessibilityLabel={`Rejoin ${invite.apartmentName}`}
              >
                Rejoin
              </OnlineButton>
              <OnlineButton
                size="sm"
                variant="danger-soft"
                className="flex-1"
                isDisabled={answer.isPending}
                onPress={() => answer.mutate({ inviteId: invite.id, accept: false })}
                accessibilityLabel={`Decline the invitation to ${invite.apartmentName}`}
              >
                Decline
              </OnlineButton>
            </View>
          </Card.Body>
        </Card>
      ))}
    </View>
  );
}
