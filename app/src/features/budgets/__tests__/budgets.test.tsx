import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { fetchCategories } from '@/features/apartments/api';
import { renderWithProviders } from '@/test/render';

import { type Budget, fetchBudgets, removeBudget, setBudget } from '../api';
import { BudgetProgress } from '../components/budget-progress';
import { BudgetSettings } from '../components/budget-settings';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/apartments/api', () => ({
  ...jest.requireActual('@/features/apartments/api'),
  fetchCategories: jest.fn(),
}));
jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  fetchBudgets: jest.fn(),
  setBudget: jest.fn(),
  removeBudget: jest.fn(),
}));

const FLAT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MONTH = '2026-11-01';

const overall: Budget = { id: 'b1', categoryId: null, limitMinor: 100_000, spentMinor: 30_000 };
const food: Budget = { id: 'b2', categoryId: 'food', limitMinor: 50_000, spentMinor: 45_000 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(fetchCategories).mockResolvedValue([
    { id: 'food', name: 'Groceries' },
    { id: 'home', name: 'Household' },
  ]);
  jest.mocked(fetchBudgets).mockResolvedValue([overall, food]);
  jest.mocked(setBudget).mockResolvedValue();
  jest.mocked(removeBudget).mockResolvedValue();
});

describe('BudgetProgress', () => {
  it('shows each budget against the month, and warns near the cap', async () => {
    await renderWithProviders(<BudgetProgress apartmentId={FLAT} month={MONTH} currency="PKR" />);

    expect(
      await screen.findByLabelText('All spending: Rs 300.00 of Rs 1,000.00, Rs 700.00 left'),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Groceries: Rs 450.00 of Rs 500.00, Rs 50.00 left'),
    ).toBeOnTheScreen();
    expect(fetchBudgets).toHaveBeenCalledWith(FLAT, MONTH);
  });

  it('shows nothing when the apartment has no budgets', async () => {
    jest.mocked(fetchBudgets).mockResolvedValue([]);
    await renderWithProviders(<BudgetProgress apartmentId={FLAT} month={MONTH} currency="PKR" />);

    await waitFor(() => expect(fetchBudgets).toHaveBeenCalled());
    expect(screen.queryByText(/Budgets for/)).not.toBeOnTheScreen();
  });
});

describe('BudgetSettings', () => {
  const settings = <BudgetSettings apartmentId={FLAT} currency="PKR" timezone="Asia/Karachi" />;

  it('lists all spending and every category, with their budgets', async () => {
    await renderWithProviders(settings);

    expect(
      await screen.findByRole('button', { name: 'All spending: Rs 1,000.00 a month' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Groceries: Rs 500.00 a month' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Household: No budget' })).toBeOnTheScreen();
  });

  it('sets a budget for a category in whole minor units', async () => {
    const user = userEvent.setup();
    await renderWithProviders(settings);

    await user.press(await screen.findByRole('button', { name: 'Household: No budget' }));
    await user.type(screen.getByLabelText('Monthly budget in PKR'), '250.50');
    await user.press(screen.getByRole('button', { name: 'Save budget' }));

    await waitFor(() => expect(setBudget).toHaveBeenCalledWith(FLAT, 'home', 25_050));
  });

  it('explains an amount it cannot save', async () => {
    const user = userEvent.setup();
    await renderWithProviders(settings);

    await user.press(await screen.findByRole('button', { name: 'Household: No budget' }));
    await user.type(screen.getByLabelText('Monthly budget in PKR'), '0');
    await user.press(screen.getByRole('button', { name: 'Save budget' }));

    expect(screen.getByText(/greater than zero/)).toBeOnTheScreen();
    expect(setBudget).not.toHaveBeenCalled();
  });

  it('removes a budget', async () => {
    const user = userEvent.setup();
    await renderWithProviders(settings);

    await user.press(
      await screen.findByRole('button', { name: 'All spending: Rs 1,000.00 a month' }),
    );
    await user.press(screen.getByRole('button', { name: 'Remove budget' }));

    await waitFor(() => expect(removeBudget).toHaveBeenCalledWith(FLAT, null));
  });
});
