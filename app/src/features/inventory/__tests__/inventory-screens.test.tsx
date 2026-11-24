import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import AddExpenseScreen from '@/app/(app)/apartments/[apartmentId]/expenses/new';
import {
  type Apartment,
  fetchApartment,
  fetchCategories,
  fetchMembers,
  type Member,
} from '@/features/apartments/api';
import { type ExpenseDetail, fetchExpenseDetail, postExpense } from '@/features/expenses/api';
import { fetchQuickAdds } from '@/features/quick-add/api';
import { renderWithProviders } from '@/test/render';

import {
  fetchExpenseItemLink,
  fetchInventory,
  fetchItemCosts,
  type InventoryItem,
  linkInventoryCost,
  removeInventoryItem,
  saveInventoryItem,
  unlinkInventoryCost,
} from '../api';
import { ExpenseItemSection } from '../components/expense-item-section';
import { InventoryList } from '../components/inventory-list';
import { ItemDetail } from '../components/item-detail';
import { ItemFormScreen } from '../components/item-form';

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const APARTMENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
let mockCurrentUser = ANAS;

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchApartment: jest.fn(),
  fetchMembers: jest.fn(),
  fetchCategories: jest.fn(),
}));
jest.mock('@/features/expenses/api', () => ({
  ...jest.requireActual('@/features/expenses/api'),
  fetchExpenseDetail: jest.fn(),
  postExpense: jest.fn(),
}));
jest.mock('@/features/quick-add/api', () => ({
  ...jest.requireActual('@/features/quick-add/api'),
  fetchQuickAdds: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchInventory: jest.fn(),
  fetchItemCosts: jest.fn(),
  fetchExpenseItemLink: jest.fn(),
  saveInventoryItem: jest.fn(),
  removeInventoryItem: jest.fn(),
  linkInventoryCost: jest.fn(),
  unlinkInventoryCost: jest.fn(),
}));
jest.mock('@/features/auth/session-provider', () => ({ useCurrentUserId: () => mockCurrentUser }));

const apartment: Apartment = {
  id: APARTMENT,
  name: 'Flat 4B',
  currency: 'PKR',
  timezone: 'Asia/Karachi',
  settlement_day: 1,
  approval_days: 7,
  due_reminder_days: 1,
  settlement_reminder_days: 2,
  location: null,
  show_location: false,
  created_by: ANAS,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

function member(userId: string, displayName: string, role: Member['role'] = 'member'): Member {
  return {
    membershipId: `m-${userId}`,
    userId,
    role,
    canAddExpense: true,
    joinedAt: '2026-11-01T00:00:00Z',
    leftAt: null,
    leftReason: null,
    hiddenAt: null,
    displayName,
    avatarPath: null,
  };
}

const fridge: InventoryItem = {
  id: 'fridge',
  name: 'Fridge',
  notes: 'Kitchen',
  ownerType: 'apartment',
  ownerId: null,
  condition: 'fair',
  status: 'needs_repair',
  createdAt: '2026-11-01T00:00:00Z',
  purchaseMinor: 90_000,
  maintenanceMinor: 6_000,
  costCount: 2,
  hasProvisional: true,
};
const iron: InventoryItem = {
  ...fridge,
  id: 'iron',
  name: 'Iron',
  notes: null,
  ownerType: 'member',
  ownerId: ZUBAIR,
  condition: 'good',
  status: 'in_use',
  purchaseMinor: 0,
  maintenanceMinor: 0,
  costCount: 0,
  hasProvisional: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = ANAS;
  jest.mocked(useLocalSearchParams).mockReturnValue({ apartmentId: APARTMENT });
  jest.mocked(fetchApartment).mockResolvedValue(apartment);
  jest
    .mocked(fetchMembers)
    .mockResolvedValue([member(ANAS, 'Anas', 'admin'), member(ZUBAIR, 'Zubair')]);
  jest.mocked(fetchCategories).mockResolvedValue([]);
  jest.mocked(fetchQuickAdds).mockResolvedValue([]);
  jest.mocked(fetchInventory).mockResolvedValue([iron, fridge]);
  jest.mocked(fetchItemCosts).mockResolvedValue([
    {
      expenseId: 'gas',
      kind: 'maintenance',
      title: 'Fridge gas',
      amountMinor: 6_000,
      expenseDate: '2026-11-20',
      status: 'provisional',
    },
    {
      expenseId: 'bought',
      kind: 'purchase',
      title: 'New fridge',
      amountMinor: 90_000,
      expenseDate: '2026-11-02',
      status: 'final',
    },
  ]);
  jest.mocked(fetchExpenseItemLink).mockResolvedValue(null);
  jest
    .mocked(fetchExpenseDetail)
    .mockResolvedValue({ id: 'gas', status: 'final' } as unknown as ExpenseDetail);
  jest.mocked(saveInventoryItem).mockResolvedValue('new-item');
  jest.mocked(removeInventoryItem).mockResolvedValue();
  jest.mocked(linkInventoryCost).mockResolvedValue();
  jest.mocked(unlinkInventoryCost).mockResolvedValue();
  jest.mocked(postExpense).mockResolvedValue('expense-1');
});

it('lists items with their owner, state and cost', async () => {
  await renderWithProviders(<InventoryList apartmentId={APARTMENT} />);
  expect(
    await screen.findByRole('button', {
      name: 'Fridge, Needs repair, The flat’s, Cost Rs 960.00, provisional',
    }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'Iron, In use, Zubair’s, No costs yet' }),
  ).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Add an item' })).toBeOnTheScreen();
});

it('hides adding items from a member who may not add expenses', async () => {
  jest
    .mocked(fetchMembers)
    .mockResolvedValue([
      member(ANAS, 'Anas', 'admin'),
      { ...member(ZUBAIR, 'Zubair'), canAddExpense: false },
    ]);
  mockCurrentUser = ZUBAIR;
  await renderWithProviders(<InventoryList apartmentId={APARTMENT} />);
  await screen.findByText('Fridge');
  expect(screen.queryByRole('button', { name: 'Add an item' })).not.toBeOnTheScreen();
});

it('adds a member’s own item', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<ItemFormScreen apartmentId={APARTMENT} />);

  await user.type(await screen.findByLabelText('Item name'), ' Kettle ');
  await user.press(screen.getByRole('button', { name: 'Zubair' }));
  await user.press(screen.getByRole('button', { name: 'Add item' }));

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  const [apartmentId, input, options] = jest.mocked(saveInventoryItem).mock.calls[0];
  expect(apartmentId).toBe(APARTMENT);
  expect(input).toEqual({
    name: 'Kettle',
    notes: null,
    ownerType: 'member',
    ownerId: ZUBAIR,
    condition: 'good',
    status: 'in_use',
  });
  expect(options.itemId).toBeUndefined();
  expect(options.requestId).toEqual(expect.any(String));
});

it('says what is missing before saving', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<ItemFormScreen apartmentId={APARTMENT} />);
  await user.press(await screen.findByRole('button', { name: 'Add item' }));
  expect(screen.getByText('Give the item a name.')).toBeOnTheScreen();
  expect(saveInventoryItem).not.toHaveBeenCalled();
});

it('shows an item’s totals and expenses, and adds a maintenance cost from it', async () => {
  const user = userEvent.setup();
  mockCurrentUser = ZUBAIR;
  await renderWithProviders(<ItemDetail apartmentId={APARTMENT} itemId="fridge" />);

  expect(await screen.findByText('Rs 960.00')).toBeOnTheScreen();
  expect(screen.getByText(/can still change/)).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'Fridge gas, Maintenance, Rs 60.00, Provisional' }),
  ).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Remove item' })).not.toBeOnTheScreen();

  await user.press(screen.getByRole('button', { name: 'Add a cost' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/apartments/[apartmentId]/expenses/new',
    params: { apartmentId: APARTMENT, itemId: 'fridge', costKind: 'maintenance' },
  });
});

it('lets an admin remove an item after confirming', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<ItemDetail apartmentId={APARTMENT} itemId="fridge" />);

  await user.press(await screen.findByRole('button', { name: 'Remove item' }));
  await user.press(await screen.findByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(jest.mocked(removeInventoryItem).mock.calls[0]?.[0]).toBe('fridge'));
  await waitFor(() => expect(router.back).toHaveBeenCalled());
});

it('counts an expense towards an item from the expense', async () => {
  const user = userEvent.setup();
  await renderWithProviders(<ExpenseItemSection apartmentId={APARTMENT} expenseId="gas" />);

  await user.press(await screen.findByRole('button', { name: 'Choose an item' }));
  await user.press(await screen.findByRole('button', { name: 'Fridge' }));
  await user.press(screen.getByRole('button', { name: 'Purchase' }));
  await user.press(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(jest.mocked(linkInventoryCost).mock.calls[0]?.[0]).toEqual({
      expenseId: 'gas',
      itemId: 'fridge',
      kind: 'purchase',
    }),
  );
});

it('shows the item an expense counts towards, and stops counting it', async () => {
  jest
    .mocked(fetchExpenseItemLink)
    .mockResolvedValue({ itemId: 'fridge', itemName: 'Fridge', kind: 'maintenance' });
  const user = userEvent.setup();
  await renderWithProviders(<ExpenseItemSection apartmentId={APARTMENT} expenseId="gas" />);

  expect(
    await screen.findByRole('link', { name: 'Counts towards Fridge as maintenance' }),
  ).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Stop counting it' }));
  await waitFor(() => expect(jest.mocked(unlinkInventoryCost).mock.calls[0]?.[0]).toBe('gas'));
});

it('shows nothing on an expense for a member who cannot link it, when it is not linked', async () => {
  jest
    .mocked(fetchMembers)
    .mockResolvedValue([{ ...member(ANAS, 'Anas', 'admin'), canAddExpense: false }]);
  await renderWithProviders(<ExpenseItemSection apartmentId={APARTMENT} expenseId="gas" />);
  await waitFor(() => expect(fetchExpenseItemLink).toHaveBeenCalled());
  expect(screen.queryByText('Inventory item')).not.toBeOnTheScreen();
});

describe('adding a cost from an item', () => {
  beforeEach(() => {
    jest
      .mocked(useLocalSearchParams)
      .mockReturnValue({ apartmentId: APARTMENT, itemId: 'fridge', costKind: 'maintenance' });
  });

  it('counts the new expense towards the item', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<AddExpenseScreen />);

    expect(await screen.findByText('This expense will count towards Fridge as:')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('What was it for?'), 'Fridge gas');
    await user.type(screen.getByLabelText('Amount in PKR'), '60');
    await user.press(screen.getByRole('button', { name: 'Save expense' }));

    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(jest.mocked(linkInventoryCost).mock.calls[0]?.[0]).toEqual({
      expenseId: 'expense-1',
      itemId: 'fridge',
      kind: 'maintenance',
    });
  });

  it('keeps the expense and offers to try again when linking fails', async () => {
    jest
      .mocked(linkInventoryCost)
      .mockRejectedValueOnce({ message: 'item_not_found' })
      .mockResolvedValueOnce();
    const user = userEvent.setup();
    await renderWithProviders(<AddExpenseScreen />);

    await user.type(await screen.findByLabelText('What was it for?'), 'Fridge gas');
    await user.type(screen.getByLabelText('Amount in PKR'), '60');
    await user.press(screen.getByRole('button', { name: 'Save expense' }));

    expect(await screen.findByText('The expense was saved.')).toBeOnTheScreen();
    expect(screen.getByText(/This item was removed/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Count it towards Fridge again' }));
    await waitFor(() => expect(screen.queryByText(/This item was removed/)).not.toBeOnTheScreen());
    expect(postExpense).toHaveBeenCalledTimes(1);
    expect(linkInventoryCost).toHaveBeenCalledTimes(2);
  });
});
