import { Typography } from 'heroui-native';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { SwitchRow } from '@/components/form/switch-row';
import { LoadError, LoadingRows } from '@/components/query-states';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { userErrorMessage } from '@/lib/errors';
import { useIsOnline } from '@/lib/network';

import { useMutedPushCategories, useSetPushCategory } from '../hooks';
import { PUSH_CATEGORIES } from '../preferences';

/**
 * Which push notifications the user gets, by group, for every apartment.
 * Each switch saves when it is flipped; offline they wait for a connection.
 */
export function PushSettingsSection() {
  const userId = useCurrentUserId();
  const muted = useMutedPushCategories(userId);
  const setCategory = useSetPushCategory(userId);
  const isOnline = useIsOnline();

  return (
    <View className="gap-3">
      <Typography.Heading type="h6">Notifications</Typography.Heading>
      <Typography.Paragraph type="body-xs" color="muted">
        Choose what reaches your phone, in every apartment. What you turn off still shows as a red
        dot in the app.
      </Typography.Paragraph>
      <FormAlert
        message={
          setCategory.error
            ? userErrorMessage(setCategory.error, 'Could not save your notification settings.')
            : null
        }
      />
      {muted.isPending ? (
        <LoadingRows count={2} />
      ) : muted.isLoadingError ? (
        <LoadError
          message={userErrorMessage(muted.error, 'Could not load your notification settings.')}
          onRetry={() => void muted.refetch()}
        />
      ) : (
        <View className="gap-2">
          {PUSH_CATEGORIES.map((category) => (
            <SwitchRow
              key={category.value}
              label={category.label}
              description={category.description}
              isSelected={!muted.data.includes(category.value)}
              onSelectedChange={(isEnabled) =>
                setCategory.mutate({ category: category.value, isEnabled })
              }
              isDisabled={!isOnline}
            />
          ))}
          {isOnline ? null : (
            <Typography.Paragraph type="body-xs" color="muted">
              You are offline. Reconnect to change these.
            </Typography.Paragraph>
          )}
        </View>
      )}
    </View>
  );
}
