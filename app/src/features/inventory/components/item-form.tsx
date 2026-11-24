import { router } from 'expo-router';
import { FieldError, Input, Label, TextArea, TextField, Typography } from 'heroui-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { type Choice, ChoiceChips } from '@/components/choice-chips';
import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { memberLabel } from '@/features/expenses/member-label';
import { userErrorMessage } from '@/lib/errors';
import { randomUuid } from '@/lib/uuid';

import type { InventoryItem, ItemCondition, ItemStatus } from '../api';
import { INVENTORY_ERROR_MESSAGES } from '../errors';
import { useSaveInventoryItem } from '../hooks';
import {
  CONDITION_LABEL,
  draftFromItem,
  type ItemDraft,
  newItemDraft,
  STATUS_LABEL,
  validateItemDraft,
} from '../items';
import { useInventoryData } from './use-inventory-data';

const CONDITIONS = Object.entries(CONDITION_LABEL).map(([value, label]) => ({
  value: value as ItemCondition,
  label,
}));
const STATUSES = Object.entries(STATUS_LABEL).map(([value, label]) => ({
  value: value as ItemStatus,
  label,
}));

/** Adds an item, or changes the one `itemId` names. */
export function ItemFormScreen({ apartmentId, itemId }: { apartmentId: string; itemId?: string }) {
  const data = useInventoryData(apartmentId);
  if (data.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  if (data.error || !data.items.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(data.error, 'Could not load the inventory.')}
          onRetry={data.retry}
        />
      </Screen>
    );
  }
  const item = itemId ? data.items.data.find((entry) => entry.id === itemId) : undefined;
  if (itemId && !item) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message="This item was removed." />
      </Screen>
    );
  }
  if (!data.canManage) {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message="Only members who may add expenses can add and change items."
        />
      </Screen>
    );
  }

  // The owner chips: the flat, every current member, and a former member who
  // still owns this item.
  const owners: Choice<string>[] = [
    { value: 'apartment', label: 'The flat' },
    ...data.currentMembers.map((member) => ({
      value: member.userId,
      label: memberLabel(member, data.userId),
    })),
  ];
  if (item?.ownerId && !owners.some((owner) => owner.value === item.ownerId)) {
    owners.push({ value: item.ownerId, label: data.nameOf(item.ownerId) });
  }

  return <ItemForm apartmentId={apartmentId} item={item} owners={owners} />;
}

function ItemForm({
  apartmentId,
  item,
  owners,
}: {
  apartmentId: string;
  item: InventoryItem | undefined;
  owners: Choice<string>[];
}) {
  const [draft, setDraft] = useState<ItemDraft>(() =>
    item ? draftFromItem(item) : newItemDraft(),
  );
  const [showErrors, setShowErrors] = useState(false);
  // One id per item being added, so a retried save cannot add it twice.
  const [requestId] = useState(randomUuid);
  const save = useSaveInventoryItem(apartmentId);
  const result = useMemo(() => validateItemDraft(draft), [draft]);
  const update = (patch: Partial<ItemDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const error = (field: keyof typeof result.errors) =>
    showErrors ? result.errors[field] : undefined;

  const submit = () => {
    setShowErrors(true);
    if (!result.value) return;
    save.mutate(
      { item: result.value, itemId: item?.id, requestId: item ? undefined : requestId },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen padTop={false}>
      <TextField isRequired isInvalid={error('name') !== undefined}>
        <Label>Name</Label>
        <Input
          variant="secondary"
          value={draft.name}
          onChangeText={(name) => update({ name })}
          placeholder="Fridge, sofa, Wi-Fi router…"
          maxLength={80}
          accessibilityLabel="Item name"
        />
        <FieldError>{error('name')}</FieldError>
      </TextField>
      <View className="gap-2">
        <Typography.Paragraph weight="semibold">Whose is it?</Typography.Paragraph>
        <ChoiceChips
          choices={owners}
          selected={draft.owner}
          onSelect={(owner) => update({ owner })}
          accessibilityLabel="Owner"
        />
        <Typography.Paragraph type="body-xs" color="muted">
          The flat&apos;s if you bought it together. Ownership is only a record; it changes
          nobody&apos;s balance.
        </Typography.Paragraph>
      </View>
      <View className="gap-2">
        <Typography.Paragraph weight="semibold">Condition</Typography.Paragraph>
        <ChoiceChips
          choices={CONDITIONS}
          selected={draft.condition}
          onSelect={(condition) => update({ condition })}
          accessibilityLabel="Condition"
        />
      </View>
      <View className="gap-2">
        <Typography.Paragraph weight="semibold">Status</Typography.Paragraph>
        <ChoiceChips
          choices={STATUSES}
          selected={draft.status}
          onSelect={(status) => update({ status })}
          accessibilityLabel="Status"
        />
        <Typography.Paragraph type="body-xs" color="muted">
          Mark an item gone once it is sold, thrown away or taken by its owner. Record any money
          involved as an expense or a payment.
        </Typography.Paragraph>
      </View>
      <TextField isInvalid={error('notes') !== undefined}>
        <Label>Notes (optional)</Label>
        <TextArea
          variant="secondary"
          value={draft.notes}
          onChangeText={(notes) => update({ notes })}
          placeholder="Where it is, its warranty…"
          maxLength={500}
          accessibilityLabel="Notes"
        />
        <FieldError>{error('notes')}</FieldError>
      </TextField>
      <FormAlert
        message={
          save.error
            ? userErrorMessage(save.error, 'Could not save the item.', INVENTORY_ERROR_MESSAGES)
            : showErrors && !result.value
              ? 'Check the highlighted fields.'
              : null
        }
      />
      <OnlineButton onPress={submit} isDisabled={save.isPending}>
        {save.isPending ? 'Saving…' : item ? 'Save changes' : 'Add item'}
      </OnlineButton>
    </Screen>
  );
}
