import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchBudgets, removeBudget, setBudget } from './api';

export const budgetKeys = {
  /** Under the apartment's money key: every expense changes what was spent. */
  all: (apartmentId: string) => ['money', apartmentId, 'budgets'] as const,
  month: (apartmentId: string, month: string) => ['money', apartmentId, 'budgets', month] as const,
};

export function useBudgets(apartmentId: string, month: string) {
  return useQuery({
    queryKey: budgetKeys.month(apartmentId, month),
    queryFn: () => fetchBudgets(apartmentId, month),
  });
}

/** Admins only: sets or removes the cap for everything (categoryId null) or a category. */
export function useBudgetActions(apartmentId: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: budgetKeys.all(apartmentId) });
  const set = useMutation({
    mutationFn: (input: { categoryId: string | null; limitMinor: number }) =>
      setBudget(apartmentId, input.categoryId, input.limitMinor),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (categoryId: string | null) => removeBudget(apartmentId, categoryId),
    onSettled: refresh,
  });
  return { set, remove };
}
