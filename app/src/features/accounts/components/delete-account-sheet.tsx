import { BottomSheet, Button } from 'heroui-native';
import { View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { userErrorMessage } from '@/lib/errors';

import type { MyAccount } from '../api';
import { useAccountMutations } from '../hooks';

/**
 * Asks before deleting a bank or wallet account, since flatmates it was shared
 * with lose it too. `account` null keeps the sheet closed.
 */
export function DeleteAccountSheet({
  account,
  onClose,
  onDeleted,
}: {
  account: MyAccount | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { remove } = useAccountMutations();

  return (
    <BottomSheet
      isOpen={account !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content>
          <View className="gap-6">
            <View className="gap-2">
              <BottomSheet.Title>Delete {account?.provider}?</BottomSheet.Title>
              <BottomSheet.Description>
                {account && account.sharedWith.length > 0
                  ? 'Flatmates you shared it with will no longer see it.'
                  : 'It is private, so nobody else sees it.'}
              </BottomSheet.Description>
            </View>
            <FormAlert
              message={remove.error ? userErrorMessage(remove.error, 'Could not delete it.') : null}
            />
            <View className="gap-3">
              <OnlineButton
                variant="danger"
                isDisabled={remove.isPending}
                onPress={() => {
                  if (!account) return;
                  remove.mutate(account.id, {
                    onSuccess: () => {
                      onClose();
                      onDeleted?.();
                    },
                  });
                }}
              >
                {remove.isPending ? 'Deleting…' : 'Delete account'}
              </OnlineButton>
              <Button variant="tertiary" onPress={onClose} isDisabled={remove.isPending}>
                Cancel
              </Button>
            </View>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
