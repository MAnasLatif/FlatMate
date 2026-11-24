import { router } from 'expo-router';
import { Card, PressableFeedback, Typography } from 'heroui-native';
import { View } from 'react-native';

import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { StatusChip } from '@/components/status-chip';
import { formatMoney } from '@/features/apartments/currencies';
import { userErrorMessage } from '@/lib/errors';

import type { InventoryItem, ItemStatus } from '../api';
import { CONDITION_LABEL, ownerLabel, sortItems, STATUS_LABEL } from '../items';
import { useInventoryData } from './use-inventory-data';

export const STATUS_COLOR: Record<ItemStatus, 'success' | 'warning' | 'default'> = {
  in_use: 'success',
  needs_repair: 'warning',
  gone: 'default',
};

/**
 * The apartment's shared things (FR-10.5): who owns each, its state, and
 * what it has cost. Anyone who may add expenses adds an item here.
 */
export function InventoryList({ apartmentId }: { apartmentId: string }) {
  const data = useInventoryData(apartmentId);

  if (data.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  if (data.error || !data.apartment.data || !data.items.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(data.error, 'Could not load the inventory.')}
          onRetry={data.retry}
        />
      </Screen>
    );
  }
  const currency = data.apartment.data.currency;

  return (
    <Screen
      freshness={data.items}
      padTop={false}
      refreshing={data.items.isRefetching}
      onRefresh={data.retry}
    >
      <Typography.Paragraph type="body-sm" color="muted">
        The flat&apos;s things and members&apos; own things that everyone uses. What an item cost to
        buy and to repair are expenses counted towards it.
      </Typography.Paragraph>
      {data.items.data.length === 0 ? (
        <Typography.Paragraph color="muted" className="py-10 text-center">
          No items yet.
        </Typography.Paragraph>
      ) : null}
      {sortItems(data.items.data).map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          owner={ownerLabel(item, data.nameOf)}
          currency={currency}
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/inventory/[itemId]',
              params: { apartmentId, itemId: item.id },
            })
          }
        />
      ))}
      {data.canManage ? (
        <OnlineButton
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/inventory/new',
              params: { apartmentId },
            })
          }
        >
          Add an item
        </OnlineButton>
      ) : null}
    </Screen>
  );
}

function ItemCard({
  item,
  owner,
  currency,
  onPress,
}: {
  item: InventoryItem;
  owner: string;
  currency: string;
  onPress: () => void;
}) {
  const total = item.purchaseMinor + item.maintenanceMinor;
  const cost = item.costCount === 0 ? 'No costs yet' : `Cost ${formatMoney(total, currency)}`;
  const provisional = item.hasProvisional ? ', provisional' : '';
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${STATUS_LABEL[item.status]}, ${owner}, ${cost}${provisional}`}
      className="rounded-3xl"
    >
      <Card>
        <Card.Body className="gap-2">
          <View className="flex-row items-center justify-between gap-2">
            <Typography.Paragraph weight="semibold" numberOfLines={1} className="shrink">
              {item.name}
            </Typography.Paragraph>
            <StatusChip size="sm" variant="soft" color={STATUS_COLOR[item.status]}>
              {STATUS_LABEL[item.status]}
            </StatusChip>
          </View>
          <Typography.Paragraph type="body-sm">
            {owner} · {CONDITION_LABEL[item.condition]} condition
          </Typography.Paragraph>
          <Typography.Paragraph type="body-xs" color="muted">
            {cost}
            {item.hasProvisional ? ' (includes provisional expenses)' : ''}
          </Typography.Paragraph>
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
