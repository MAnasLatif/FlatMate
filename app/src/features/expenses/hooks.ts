import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { addMonths } from '@/lib/time';

import {
  EXPENSES_PAGE_SIZE,
  fetchExpensesPage,
  fetchMyBalances,
  fetchMyMonthlyShare,
  postExpense,
} from './api';
import type { ValidExpense } from './draft';

export const expenseKeys = {
  /** Everything about an apartment's money: invalidate after any financial change. */
  apartment: (apartmentId: string) => ['money', apartmentId] as const,
  list: (apartmentId: string, monthStartDate: string) =>
    ['money', apartmentId, 'expenses', monthStartDate] as const,
  balances: (apartmentId: string) => ['money', apartmentId, 'balances'] as const,
  monthlyShare: (apartmentId: string, monthStartDate: string) =>
    ['money', apartmentId, 'monthly-share', monthStartDate] as const,
  detail: (apartmentId: string, expenseId: string) =>
    ['money', apartmentId, 'expense', expenseId] as const,
};

export function useExpenses(apartmentId: string, monthStartDate: string) {
  return useInfiniteQuery({
    queryKey: expenseKeys.list(apartmentId, monthStartDate),
    queryFn: ({ pageParam }) =>
      fetchExpensesPage(apartmentId, monthStartDate, addMonths(monthStartDate, 1), pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === EXPENSES_PAGE_SIZE ? pages.length : undefined,
  });
}

export function useMyBalances(apartmentId: string) {
  return useQuery({
    queryKey: expenseKeys.balances(apartmentId),
    queryFn: () => fetchMyBalances(apartmentId),
  });
}

export function useMyMonthlyShare(apartmentId: string, monthStartDate: string) {
  return useQuery({
    queryKey: expenseKeys.monthlyShare(apartmentId, monthStartDate),
    queryFn: () => fetchMyMonthlyShare(apartmentId, monthStartDate),
  });
}

/** Invalidates every money query of an apartment after a financial change. */
export function useRefreshMoney(apartmentId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: expenseKeys.apartment(apartmentId) });
}

export function usePostExpense(apartmentId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({
    mutationFn: (input: { expense: ValidExpense; requestId: string }) =>
      postExpense(apartmentId, input.expense, input.requestId),
    onSuccess: refresh,
  });
}
