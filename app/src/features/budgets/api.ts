import { supabase } from '@/lib/supabase';

/**
 * A monthly cap on the apartment's spending, for everything (no category) or
 * one category (FR-10.3). Admins set them; every member sees them. Spending
 * counts the expenses dated in the month, without cancelled ones, and with
 * bills not paid yet.
 */
export type Budget = {
  id: string;
  /** Null: all of the apartment's spending. */
  categoryId: string | null;
  limitMinor: number;
  spentMinor: number;
};

/** The budgets with the spending of the month starting on `month` (YYYY-MM-01). */
export async function fetchBudgets(apartmentId: string, month: string): Promise<Budget[]> {
  const { data, error } = await supabase.rpc('get_budgets', {
    p_apartment_id: apartmentId,
    p_month: month,
  });
  if (error) throw error;
  return data.map((row) => ({
    id: row.budget_id,
    categoryId: row.category_id,
    limitMinor: row.limit_minor,
    spentMinor: row.spent_minor,
  }));
}

export async function setBudget(
  apartmentId: string,
  categoryId: string | null,
  limitMinor: number,
): Promise<void> {
  const { error } = await supabase.rpc('set_budget', {
    p_apartment_id: apartmentId,
    p_limit_minor: limitMinor,
    p_category_id: categoryId ?? undefined,
  });
  if (error) throw error;
}

export async function removeBudget(apartmentId: string, categoryId: string | null): Promise<void> {
  const { error } = await supabase.rpc('remove_budget', {
    p_apartment_id: apartmentId,
    p_category_id: categoryId ?? undefined,
  });
  if (error) throw error;
}
