import type {
  CostKind,
  InventoryItem,
  InventoryItemInput,
  ItemCondition,
  ItemOwnerType,
  ItemStatus,
} from './api';

export const STATUS_LABEL: Record<ItemStatus, string> = {
  in_use: 'In use',
  needs_repair: 'Needs repair',
  gone: 'Gone',
};

export const CONDITION_LABEL: Record<ItemCondition, string> = {
  new: 'New',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

export const COST_KIND_LABEL: Record<CostKind, string> = {
  purchase: 'Purchase',
  maintenance: 'Maintenance',
};

/** "The flat's", or the owner's name as the reader sees it ("Yours" for themselves). */
export function ownerLabel(
  item: Pick<InventoryItem, 'ownerType' | 'ownerId'>,
  nameOf: (userId: string) => string,
): string {
  if (item.ownerType === 'apartment' || item.ownerId === null) return 'The flat’s';
  const name = nameOf(item.ownerId);
  return name === 'You' ? 'Yours' : `${name}’s`;
}

/** Items still around first, then gone ones; by name within each. */
export function sortItems(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort(
    (a, b) =>
      Number(a.status === 'gone') - Number(b.status === 'gone') ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

export type ItemDraft = {
  name: string;
  notes: string;
  /** 'apartment', or the id of the member who owns it. */
  owner: string;
  condition: ItemCondition;
  status: ItemStatus;
};

export function newItemDraft(): ItemDraft {
  return { name: '', notes: '', owner: 'apartment', condition: 'good', status: 'in_use' };
}

export function draftFromItem(item: InventoryItem): ItemDraft {
  return {
    name: item.name,
    notes: item.notes ?? '',
    owner: item.ownerType === 'apartment' ? 'apartment' : (item.ownerId ?? 'apartment'),
    condition: item.condition,
    status: item.status,
  };
}

export type ItemDraftResult = {
  value: InventoryItemInput | null;
  errors: { name?: string; notes?: string };
};

/** Checks the form as the database will, so most mistakes show before saving. */
export function validateItemDraft(draft: ItemDraft): ItemDraftResult {
  const name = draft.name.trim();
  const notes = draft.notes.trim();
  const errors: ItemDraftResult['errors'] = {};
  if (name.length === 0) errors.name = 'Give the item a name.';
  else if (name.length > 80) errors.name = 'Keep the name to 80 characters.';
  if (notes.length > 500) errors.notes = 'Keep the notes to 500 characters.';
  if (errors.name || errors.notes) return { value: null, errors };

  const ownerType: ItemOwnerType = draft.owner === 'apartment' ? 'apartment' : 'member';
  return {
    value: {
      name,
      notes: notes.length > 0 ? notes : null,
      ownerType,
      ownerId: ownerType === 'member' ? draft.owner : null,
      condition: draft.condition,
      status: draft.status,
    },
    errors,
  };
}
