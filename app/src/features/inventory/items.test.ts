import type { InventoryItem } from './api';
import { draftFromItem, newItemDraft, ownerLabel, sortItems, validateItemDraft } from './items';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';

function item(name: string, patch: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: name,
    name,
    notes: null,
    ownerType: 'apartment',
    ownerId: null,
    condition: 'good',
    status: 'in_use',
    createdAt: '2026-11-01T00:00:00Z',
    purchaseMinor: 0,
    maintenanceMinor: 0,
    costCount: 0,
    hasProvisional: false,
    ...patch,
  };
}

const nameOf = (id: string) => (id === ANAS ? 'You' : 'Zubair');

describe('ownerLabel', () => {
  it('names the flat, the reader, or the owning member', () => {
    expect(ownerLabel(item('Fridge'), nameOf)).toBe('The flat’s');
    expect(ownerLabel(item('Iron', { ownerType: 'member', ownerId: ANAS }), nameOf)).toBe('Yours');
    expect(ownerLabel(item('Iron', { ownerType: 'member', ownerId: ZUBAIR }), nameOf)).toBe(
      'Zubair’s',
    );
  });
});

describe('sortItems', () => {
  it('lists items still around by name, then gone ones', () => {
    expect(
      sortItems([
        item('kettle'),
        item('Old sofa', { status: 'gone' }),
        item('Fridge', { status: 'needs_repair' }),
        item('Apple TV'),
      ]).map((entry) => entry.name),
    ).toEqual(['Apple TV', 'Fridge', 'kettle', 'Old sofa']);
  });
});

describe('validateItemDraft', () => {
  it('tidies the name and notes, and leaves empty notes out', () => {
    expect(validateItemDraft({ ...newItemDraft(), name: '  Fridge ', notes: '  ' }).value).toEqual({
      name: 'Fridge',
      notes: null,
      ownerType: 'apartment',
      ownerId: null,
      condition: 'good',
      status: 'in_use',
    });
  });

  it('makes a member the owner', () => {
    expect(validateItemDraft({ ...newItemDraft(), name: 'Iron', owner: ZUBAIR }).value).toEqual(
      expect.objectContaining({ ownerType: 'member', ownerId: ZUBAIR }),
    );
  });

  it('needs a name, and limits the name and notes', () => {
    expect(validateItemDraft(newItemDraft()).errors.name).toBe('Give the item a name.');
    expect(validateItemDraft({ ...newItemDraft(), name: 'x'.repeat(81) }).errors.name).toBe(
      'Keep the name to 80 characters.',
    );
    const long = validateItemDraft({ ...newItemDraft(), name: 'Fridge', notes: 'x'.repeat(501) });
    expect(long.value).toBeNull();
    expect(long.errors.notes).toBe('Keep the notes to 500 characters.');
  });

  it('round-trips an item through the form', () => {
    const iron = item('Iron', {
      ownerType: 'member',
      ownerId: ZUBAIR,
      notes: 'Steam',
      status: 'gone',
    });
    expect(validateItemDraft(draftFromItem(iron)).value).toEqual({
      name: 'Iron',
      notes: 'Steam',
      ownerType: 'member',
      ownerId: ZUBAIR,
      condition: 'good',
      status: 'gone',
    });
  });
});
