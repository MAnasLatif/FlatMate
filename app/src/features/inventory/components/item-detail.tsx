import { router } from 'expo-router';
import { Button, Card, PressableFeedback, Separator, Typography } from 'heroui-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useConfirm } from '@/components/confirm-dialog';
import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { StatusChip } from '@/components/status-chip';
import { formatMoney } from '@/features/apartments/currencies';
import { EXPENSE_STATUS_LABELS } from '@/features/expenses/components/expense-status';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

import type { InventoryCost } from '../api';
import { INVENTORY_ERROR_MESSAGES } from '../errors';
import { useItemCosts, useRemoveInventoryItem } from '../hooks';
import { CONDITION_LABEL, COST_KIND_LABEL, ownerLabel, STATUS_LABEL } from '../items';
import { STATUS_COLOR } from './inventory-list';
import { useInventoryData } from './use-inventory-data';

/**
 * One item: who owns it, its state, and the expenses counted towards it.
 * A new cost is added as an expense from here; an existing expense is
 * counted towards an item from its own page.
 */
export function ItemDetail({ apartmentId, itemId }: { apartmentId: string; itemId: string }) {
  const data = useInventoryData(apartmentId);
  const costs = useItemCosts(apartmentId, itemId);
  const remove = useRemoveInventoryItem(apartmentId);
  const { confirm, dialog } = useConfirm();

  if (data.isPending || costs.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  const loadError = data.error ?? costs.error;
  if (loadError || !data.apartment.data || !data.items.data || !costs.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load this item.')}
          onRetry={() => {
            data.retry();
            void costs.refetch();
          }}
        />
      </Screen>
    );
  }
  const item = data.items.data.find((entry) => entry.id === itemId);
  if (!item) {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message="This item is not available. It may have been removed."
        />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }
  const currency = data.apartment.data.currency;
  const money = (amountMinor: number) => formatMoney(amountMinor, currency);

  const addCost = () =>
    router.push({
      pathname: '/apartments/[apartmentId]/expenses/new',
      params: {
        apartmentId,
        itemId,
        costKind: item.costCount === 0 ? 'purchase' : 'maintenance',
      },
    });

  return (
    <Screen
      freshness={costs}
      padTop={false}
      refreshing={costs.isRefetching}
      onRefresh={() => {
        data.retry();
        void costs.refetch();
      }}
    >
      <Card>
        <Card.Body className="gap-2">
          <View className="flex-row items-center justify-between gap-2">
            <Typography.Heading type="h5" accessibilityRole="header" className="shrink">
              {item.name}
            </Typography.Heading>
            <StatusChip size="sm" variant="soft" color={STATUS_COLOR[item.status]}>
              {STATUS_LABEL[item.status]}
            </StatusChip>
          </View>
          <Typography.Paragraph type="body-sm">
            {ownerLabel(item, data.nameOf)} · {CONDITION_LABEL[item.condition]} condition
          </Typography.Paragraph>
          {item.notes ? (
            <Typography.Paragraph type="body-sm" color="muted">
              {item.notes}
            </Typography.Paragraph>
          ) : null}
        </Card.Body>
      </Card>

      <Section title="What it cost">
        <AmountRow label="Purchase" amount={money(item.purchaseMinor)} />
        <AmountRow label="Maintenance" amount={money(item.maintenanceMinor)} />
        <Separator />
        <AmountRow label="Total" amount={money(item.purchaseMinor + item.maintenanceMinor)} />
        {item.hasProvisional ? (
          <Typography.Paragraph type="body-xs" color="muted">
            Includes expenses that are provisional or disputed, so the total can still change.
          </Typography.Paragraph>
        ) : null}
      </Section>

      <Section title="Expenses">
        {costs.data.length === 0 ? (
          <Typography.Paragraph type="body-sm" color="muted">
            No expenses count towards this item yet. To count one you already added, open it and
            choose this item.
          </Typography.Paragraph>
        ) : (
          costs.data.map((cost) => (
            <CostRow
              key={cost.expenseId}
              cost={cost}
              amount={money(cost.amountMinor)}
              onPress={() =>
                router.push({
                  pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
                  params: { apartmentId, expenseId: cost.expenseId },
                })
              }
            />
          ))
        )}
      </Section>

      {data.canManage ? (
        <>
          <OnlineButton onPress={addCost}>Add a cost</OnlineButton>
          <Button
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/apartments/[apartmentId]/inventory/[itemId]/edit',
                params: { apartmentId, itemId },
              })
            }
          >
            Edit item
          </Button>
        </>
      ) : null}
      {data.isAdmin ? (
        <>
          <FormAlert
            message={
              remove.error
                ? userErrorMessage(
                    remove.error,
                    'Could not remove the item.',
                    INVENTORY_ERROR_MESSAGES,
                  )
                : null
            }
          />
          <OnlineButton
            variant="danger-soft"
            isDisabled={remove.isPending}
            onPress={() =>
              confirm({
                title: `Remove "${item.name}"?`,
                description:
                  'Use this for an item added by mistake. Its expenses stay as they are. To keep its history, mark it gone instead.',
                confirmLabel: 'Remove',
                isDestructive: true,
                onConfirm: () => remove.mutate(itemId, { onSuccess: () => router.back() }),
              })
            }
          >
            Remove item
          </OnlineButton>
        </>
      ) : null}
      {dialog}
    </Screen>
  );
}

function CostRow({
  cost,
  amount,
  onPress,
}: {
  cost: InventoryCost;
  amount: string;
  onPress: () => void;
}) {
  const status = EXPENSE_STATUS_LABELS[cost.status];
  const kind = COST_KIND_LABEL[cost.kind];
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${cost.title}, ${kind}, ${amount}, ${status.label}`}
    >
      <View className="flex-row items-center justify-between gap-3 py-1">
        <View className="flex-1 gap-0.5">
          <Typography.Paragraph type="body-sm" numberOfLines={1}>
            {cost.title}
          </Typography.Paragraph>
          <Typography.Paragraph type="body-xs" color="muted">
            {kind} · {formatDate(cost.expenseDate)}
          </Typography.Paragraph>
        </View>
        <View className="items-end gap-1">
          <Typography.Paragraph
            type="body-sm"
            weight="semibold"
            className={cost.status === 'void' ? 'line-through' : undefined}
          >
            {amount}
          </Typography.Paragraph>
          <StatusChip size="sm" variant="soft" color={status.color}>
            {status.label}
          </StatusChip>
        </View>
      </View>
    </PressableFeedback>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Card.Body className="gap-3">
        <Card.Title>{title}</Card.Title>
        <Separator />
        {children}
      </Card.Body>
    </Card>
  );
}

function AmountRow({ label, amount }: { label: string; amount: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Typography.Paragraph type="body-sm">{label}</Typography.Paragraph>
      <Typography.Paragraph type="body-sm" weight="semibold">
        {amount}
      </Typography.Paragraph>
    </View>
  );
}
