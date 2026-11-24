import { router } from 'expo-router';
import { Button, Card, PressableFeedback, Separator, Typography } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { type Choice, ChoiceChips } from '@/components/choice-chips';
import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { useMyMembership } from '@/features/apartments/hooks';
import { useExpenseDetail } from '@/features/expenses/hooks';
import { userErrorMessage } from '@/lib/errors';

import type { CostKind } from '../api';
import { INVENTORY_ERROR_MESSAGES } from '../errors';
import {
  useExpenseItemLink,
  useInventory,
  useLinkInventoryCost,
  useUnlinkInventoryCost,
} from '../hooks';
import { COST_KIND_LABEL, sortItems } from '../items';

const KINDS: Choice<CostKind>[] = [
  { value: 'purchase', label: COST_KIND_LABEL.purchase },
  { value: 'maintenance', label: COST_KIND_LABEL.maintenance },
];

/**
 * On an expense's page: the inventory item it counts towards, if any, and
 * for members who may add expenses a way to choose or change it. Counting an
 * expense towards an item changes no balance.
 */
export function ExpenseItemSection({
  apartmentId,
  expenseId,
}: {
  apartmentId: string;
  expenseId: string;
}) {
  const link = useExpenseItemLink(apartmentId, expenseId);
  const expense = useExpenseDetail(apartmentId, expenseId);
  const canManage = useMyMembership(apartmentId)?.canAddExpense ?? false;
  const [isChoosing, setChoosing] = useState(false);
  const unlink = useUnlinkInventoryCost(apartmentId);

  // Nothing to show while loading, or for an expense that is not available.
  if (link.isPending || !expense.data) return null;
  if (link.isError) {
    return (
      <FormAlert
        status="warning"
        message="Could not load which item this expense counts towards. Pull down to try again."
      />
    );
  }
  const current = link.data;
  const isVoid = expense.data.status === 'void';
  if (!current && (!canManage || isVoid)) return null;

  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>Inventory item</Card.Title>
        <Separator />
        {current ? (
          <PressableFeedback
            onPress={() =>
              router.push({
                pathname: '/apartments/[apartmentId]/inventory/[itemId]',
                params: { apartmentId, itemId: current.itemId },
              })
            }
            accessibilityRole="link"
            accessibilityLabel={`Counts towards ${current.itemName} as ${COST_KIND_LABEL[current.kind].toLowerCase()}`}
          >
            <Typography.Paragraph type="body-sm">
              Counts towards{' '}
              <Typography.Paragraph type="body-sm" weight="semibold" className="text-accent">
                {current.itemName}
              </Typography.Paragraph>{' '}
              as {COST_KIND_LABEL[current.kind].toLowerCase()}.
            </Typography.Paragraph>
          </PressableFeedback>
        ) : (
          <Typography.Paragraph type="body-sm" color="muted">
            Bought or repaired something the flat keeps track of? Count this expense towards it.
          </Typography.Paragraph>
        )}

        {canManage && !isChoosing ? (
          <View className="flex-row flex-wrap gap-2">
            {isVoid ? null : (
              <Button size="sm" variant="secondary" onPress={() => setChoosing(true)}>
                {current ? 'Change item' : 'Choose an item'}
              </Button>
            )}
            {current ? (
              <OnlineButton
                size="sm"
                variant="ghost"
                isDisabled={unlink.isPending}
                onPress={() => unlink.mutate(expenseId)}
              >
                Stop counting it
              </OnlineButton>
            ) : null}
          </View>
        ) : null}
        <FormAlert
          message={
            unlink.error
              ? userErrorMessage(unlink.error, 'Could not change this.', INVENTORY_ERROR_MESSAGES)
              : null
          }
        />
        {isChoosing ? (
          <ChooseItem
            apartmentId={apartmentId}
            expenseId={expenseId}
            initial={current ? { itemId: current.itemId, kind: current.kind } : null}
            onDone={() => setChoosing(false)}
          />
        ) : null}
      </Card.Body>
    </Card>
  );
}

function ChooseItem({
  apartmentId,
  expenseId,
  initial,
  onDone,
}: {
  apartmentId: string;
  expenseId: string;
  initial: { itemId: string; kind: CostKind } | null;
  onDone: () => void;
}) {
  const items = useInventory(apartmentId);
  const linkCost = useLinkInventoryCost(apartmentId);
  const [itemId, setItemId] = useState<string | null>(initial?.itemId ?? null);
  const [kind, setKind] = useState<CostKind>(initial?.kind ?? 'maintenance');

  if (items.isPending) {
    return (
      <Typography.Paragraph type="body-sm" color="muted">
        Loading the inventory…
      </Typography.Paragraph>
    );
  }
  if (items.isError) {
    return <FormAlert message={userErrorMessage(items.error, 'Could not load the inventory.')} />;
  }
  const choices = sortItems(items.data)
    .filter((item) => item.status !== 'gone' || item.id === initial?.itemId)
    .map((item) => ({ value: item.id, label: item.name }));

  return (
    <View className="gap-3">
      {choices.length === 0 ? (
        <Typography.Paragraph type="body-sm" color="muted">
          No items yet. Add one from Inventory on the members screen first.
        </Typography.Paragraph>
      ) : (
        <>
          <ChoiceChips
            choices={choices}
            selected={itemId}
            onSelect={setItemId}
            accessibilityLabel="Item"
          />
          <ChoiceChips
            choices={KINDS}
            selected={kind}
            onSelect={setKind}
            accessibilityLabel="What this expense was for the item"
          />
        </>
      )}
      <FormAlert
        message={
          linkCost.error
            ? userErrorMessage(linkCost.error, 'Could not save this.', INVENTORY_ERROR_MESSAGES)
            : null
        }
      />
      <View className="flex-row flex-wrap gap-2">
        {choices.length > 0 ? (
          <OnlineButton
            size="sm"
            isDisabled={itemId === null || linkCost.isPending}
            onPress={() => {
              if (itemId) linkCost.mutate({ expenseId, itemId, kind }, { onSuccess: onDone });
            }}
          >
            {linkCost.isPending ? 'Saving…' : 'Save'}
          </OnlineButton>
        ) : null}
        <Button size="sm" variant="ghost" onPress={onDone}>
          Cancel
        </Button>
      </View>
    </View>
  );
}
