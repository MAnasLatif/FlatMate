import { EXPENSE_ERROR_MESSAGES } from '@/features/expenses/errors';

/** Sentences for the error keys the inventory functions raise. Pass to userErrorMessage. */
export const INVENTORY_ERROR_MESSAGES: Record<string, string> = {
  ...EXPENSE_ERROR_MESSAGES,
  invalid_item_name: 'Give the item a name of up to 80 characters.',
  item_notes_too_long: 'Keep the notes to 500 characters.',
  invalid_item_owner: 'Choose whether the item is the flat’s or one member’s.',
  item_owner_not_member: 'Only a current member can own an item.',
  invalid_item_condition: 'Choose the item’s condition.',
  invalid_item_status: 'Choose whether the item is in use, needs repair or is gone.',
  too_many_items:
    'This apartment already has 300 items. Remove ones added by mistake, then try again.',
  item_not_found: 'This item was removed.',
  invalid_cost_kind: 'Choose whether this was the purchase or maintenance.',
  expense_void: 'A cancelled expense cost nothing, so it cannot count towards an item.',
  cost_not_linked: 'This expense no longer counts towards an item.',
  admin_required: 'Only admins of this apartment can remove an item.',
};
