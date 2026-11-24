import { supabase } from '@/lib/supabase';

/**
 * The apartment's shared inventory (FR-10.5). An item belongs to the flat or
 * to one member, which moves no money. Its costs are ordinary expenses linked
 * to it, so they are split, disputed and settled as usual and the item only
 * adds them up.
 */
export type ItemOwnerType = 'apartment' | 'member';
export type ItemCondition = 'new' | 'good' | 'fair' | 'poor';
export type ItemStatus = 'in_use' | 'needs_repair' | 'gone';
export type CostKind = 'purchase' | 'maintenance';
export type ExpenseStatus = 'provisional' | 'disputed' | 'final' | 'void';

export type InventoryItem = {
  id: string;
  name: string;
  notes: string | null;
  ownerType: ItemOwnerType;
  /** Set when the item is one member's own. */
  ownerId: string | null;
  condition: ItemCondition;
  status: ItemStatus;
  createdAt: string;
  /** What its linked expenses add up to now; cancelled ones count for nothing. */
  purchaseMinor: number;
  maintenanceMinor: number;
  costCount: number;
  /** A total includes an expense that can still be objected to, or is disputed. */
  hasProvisional: boolean;
};

export type InventoryItemInput = {
  name: string;
  notes: string | null;
  ownerType: ItemOwnerType;
  ownerId: string | null;
  condition: ItemCondition;
  status: ItemStatus;
};

/** An expense counted towards an item. */
export type InventoryCost = {
  expenseId: string;
  kind: CostKind;
  title: string;
  amountMinor: number;
  expenseDate: string;
  status: ExpenseStatus;
};

/** Which item an expense counts towards. */
export type ExpenseItemLink = { itemId: string; itemName: string; kind: CostKind };

/** The apartment's items by name, with their totals. */
export async function fetchInventory(apartmentId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase.rpc('get_inventory', { p_apartment_id: apartmentId });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    notes: row.notes,
    ownerType: row.owner_type as ItemOwnerType,
    ownerId: row.owner_id,
    condition: row.condition as ItemCondition,
    status: row.status as ItemStatus,
    createdAt: row.created_at,
    purchaseMinor: row.purchase_minor,
    maintenanceMinor: row.maintenance_minor,
    costCount: row.cost_count,
    hasProvisional: row.has_provisional,
  }));
}

/** The expenses linked to one item, newest first. */
export async function fetchItemCosts(itemId: string): Promise<InventoryCost[]> {
  const { data, error } = await supabase
    .from('inventory_costs')
    .select('expense_id, kind, expenses!inner(title, amount_minor, expense_date, status)')
    .eq('item_id', itemId);
  if (error) throw error;
  return data
    .map((row) => ({
      expenseId: row.expense_id,
      kind: row.kind as CostKind,
      title: row.expenses.title,
      amountMinor: row.expenses.amount_minor,
      expenseDate: row.expenses.expense_date,
      status: row.expenses.status as ExpenseStatus,
    }))
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
}

/** The item an expense counts towards, or null. */
export async function fetchExpenseItemLink(expenseId: string): Promise<ExpenseItemLink | null> {
  const { data, error } = await supabase
    .from('inventory_costs')
    .select('item_id, kind, inventory_items!inner(name)')
    .eq('expense_id', expenseId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { itemId: data.item_id, itemName: data.inventory_items.name, kind: data.kind as CostKind }
    : null;
}

/** Adds an item (no itemId) or changes one. Returns its id. */
export async function saveInventoryItem(
  apartmentId: string,
  input: InventoryItemInput,
  options: { itemId?: string; requestId?: string },
): Promise<string> {
  const { data, error } = await supabase.rpc('save_inventory_item', {
    p_apartment_id: apartmentId,
    p_name: input.name,
    p_owner_type: input.ownerType,
    p_item_id: options.itemId,
    p_owner_id: input.ownerId ?? undefined,
    p_condition: input.condition,
    p_status: input.status,
    p_notes: input.notes ?? undefined,
    p_request_id: options.requestId,
  });
  if (error) throw error;
  return data;
}

export async function removeInventoryItem(itemId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_inventory_item', { p_item_id: itemId });
  if (error) throw error;
}

/** Counts an expense towards an item; one linked elsewhere moves here. */
export async function linkInventoryCost(input: {
  expenseId: string;
  itemId: string;
  kind: CostKind;
}): Promise<void> {
  const { error } = await supabase.rpc('link_inventory_cost', {
    p_expense_id: input.expenseId,
    p_item_id: input.itemId,
    p_kind: input.kind,
  });
  if (error) throw error;
}

export async function unlinkInventoryCost(expenseId: string): Promise<void> {
  const { error } = await supabase.rpc('unlink_inventory_cost', { p_expense_id: expenseId });
  if (error) throw error;
}
