import { Button, Dialog } from 'heroui-native';
import { type ReactNode, useCallback, useState } from 'react';
import { View } from 'react-native';

export type ConfirmRequest = {
  title: string;
  description?: string;
  /** The button that goes ahead, such as "Delete". */
  confirmLabel: string;
  /** Red for actions that remove or stop something. */
  isDestructive?: boolean;
  /** Left out for a notice with one button, such as "OK". */
  cancelLabel?: string | null;
  onConfirm?: () => void;
};

/**
 * Asks before an action, in the app's own dialog rather than the system alert.
 * Render `dialog` once in the screen, and call `confirm` with what to ask:
 *
 *   const { confirm, dialog } = useConfirm();
 *   confirm({ title: 'Delete this code?', confirmLabel: 'Delete', isDestructive: true, onConfirm });
 */
export function useConfirm(): { confirm: (request: ConfirmRequest) => void; dialog: ReactNode } {
  const [isOpen, setOpen] = useState(false);
  // Kept while the dialog closes, so its text does not vanish mid-animation.
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback((next: ConfirmRequest) => {
    setRequest(next);
    setOpen(true);
  }, []);

  return {
    confirm,
    // Always mounted: a dialog mounted already open does not animate in.
    dialog: <ConfirmDialog isOpen={isOpen} onOpenChange={setOpen} request={request} />,
  };
}

function ConfirmDialog({
  isOpen,
  onOpenChange,
  request,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  request: ConfirmRequest | null;
}) {
  const cancelLabel = request?.cancelLabel === undefined ? 'Cancel' : request.cancelLabel;

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <View className="mb-5 gap-1.5">
            <Dialog.Title>{request?.title}</Dialog.Title>
            {request?.description ? (
              <Dialog.Description>{request.description}</Dialog.Description>
            ) : null}
          </View>
          <View className="flex-row justify-end gap-3">
            {cancelLabel ? (
              <Button variant="ghost" size="sm" onPress={() => onOpenChange(false)}>
                {cancelLabel}
              </Button>
            ) : null}
            <Button
              variant={request?.isDestructive ? 'danger' : 'primary'}
              size="sm"
              onPress={() => {
                onOpenChange(false);
                request?.onConfirm?.();
              }}
            >
              {request?.confirmLabel ?? 'OK'}
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
