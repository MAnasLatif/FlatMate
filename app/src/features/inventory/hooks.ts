import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchExpenseItemLink,
  fetchInventory,
  fetchItemCosts,
  type InventoryItemInput,
  linkInventoryCost,
  removeInventoryItem,
  saveInventoryItem,
  unlinkInventoryCost,
} from './api';

export const inventoryKeys = {
  /**
   * Under the apartment's money key: an item's totals change whenever one of
   * its expenses is edited, cancelled or disputed.
   */
  all: (apartmentId: string) => ['money', apartmentId, 'inventory'] as const,
  list: (apartmentId: string) => ['money', apartmentId, 'inventory', 'items'] as const,
  costs: (apartmentId: string, itemId: string) =>
    ['money', apartmentId, 'inventory', 'costs', itemId] as const,
  expenseLink: (apartmentId: string, expenseId: string) =>
    ['money', apartmentId, 'inventory', 'expense', expenseId] as const,
};

export function useInventory(apartmentId: string, enabled = true) {
  return useQuery({
    queryKey: inventoryKeys.list(apartmentId),
    queryFn: () => fetchInventory(apartmentId),
    enabled,
  });
}

export function useItemCosts(apartmentId: string, itemId: string) {
  return useQuery({
    queryKey: inventoryKeys.costs(apartmentId, itemId),
    queryFn: () => fetchItemCosts(itemId),
  });
}

export function useExpenseItemLink(apartmentId: string, expenseId: string) {
  return useQuery({
    queryKey: inventoryKeys.expenseLink(apartmentId, expenseId),
    queryFn: () => fetchExpenseItemLink(expenseId),
  });
}

function useRefreshInventory(apartmentId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all(apartmentId) });
}

export function useSaveInventoryItem(apartmentId: string) {
  const refresh = useRefreshInventory(apartmentId);
  return useMutation({
    mutationFn: (input: { item: InventoryItemInput; itemId?: string; requestId?: string }) =>
      saveInventoryItem(apartmentId, input.item, {
        itemId: input.itemId,
        requestId: input.requestId,
      }),
    onSettled: refresh,
  });
}

export function useRemoveInventoryItem(apartmentId: string) {
  const refresh = useRefreshInventory(apartmentId);
  return useMutation({ mutationFn: removeInventoryItem, onSettled: refresh });
}

export function useLinkInventoryCost(apartmentId: string) {
  const refresh = useRefreshInventory(apartmentId);
  return useMutation({ mutationFn: linkInventoryCost, onSettled: refresh });
}

export function useUnlinkInventoryCost(apartmentId: string) {
  const refresh = useRefreshInventory(apartmentId);
  return useMutation({ mutationFn: unlinkInventoryCost, onSettled: refresh });
}
