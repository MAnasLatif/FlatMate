import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCurrentUserId } from '@/features/auth/session-provider';
import type { PickedImage } from '@/lib/private-images';
import { addMonths } from '@/lib/time';

import {
  editExpense,
  setBillCollector,
  setExpenseCategoryDetail,
  EXPENSES_PAGE_SIZE,
  fetchAttachments,
  fetchExpenseDetail,
  fetchExpensesPage,
  fetchMonthlySpending,
  fetchMyBalances,
  fetchMyMonthlyShare,
  fetchPairBalances,
  fetchPairExpensesPage,
  PAIR_EXPENSES_PAGE_SIZE,
  postExpense,
  recordBillPayment,
  uploadReceipt,
  voidExpense,
} from './api';
import type { ValidExpense } from './draft';
import { type ExpenseSearch, NO_SEARCH } from './search';
import type { Contribution } from './split';

export const expenseKeys = {
  /** Everything about an apartment's money: invalidate after any financial change. */
  apartment: (apartmentId: string) => ['money', apartmentId] as const,
  list: (apartmentId: string, monthStartDate: string, search: ExpenseSearch = NO_SEARCH) =>
    ['money', apartmentId, 'expenses', monthStartDate, search] as const,
  monthlySpending: (apartmentId: string, months: number) =>
    ['money', apartmentId, 'monthly-spending', months] as const,
  balances: (apartmentId: string) => ['money', apartmentId, 'balances'] as const,
  monthlyShare: (apartmentId: string, monthStartDate: string) =>
    ['money', apartmentId, 'monthly-share', monthStartDate] as const,
  detail: (apartmentId: string, expenseId: string) =>
    ['money', apartmentId, 'expense', expenseId] as const,
  pairBalances: (apartmentId: string) => ['money', apartmentId, 'pair-balances'] as const,
  pairExpenses: (apartmentId: string, counterpartyId: string) =>
    ['money', apartmentId, 'pair-expenses', counterpartyId] as const,
};

export function useExpenses(
  apartmentId: string,
  monthStartDate: string,
  search: ExpenseSearch = NO_SEARCH,
) {
  const userId = useCurrentUserId();
  return useInfiniteQuery({
    queryKey: expenseKeys.list(apartmentId, monthStartDate, search),
    queryFn: ({ pageParam }) =>
      fetchExpensesPage(
        apartmentId,
        userId,
        monthStartDate,
        addMonths(monthStartDate, 1),
        pageParam,
        search,
      ),
    // A changed filter keeps the month's list on screen until the new one
    // arrives; a different month starts from its own loading state.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[3] === monthStartDate ? previous : undefined,
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === EXPENSES_PAGE_SIZE ? pages.length : undefined,
  });
}

/** The apartment's spending and the user's share for the last `months` months. */
export function useMonthlySpending(apartmentId: string, months: number) {
  return useQuery({
    queryKey: expenseKeys.monthlySpending(apartmentId, months),
    queryFn: () => fetchMonthlySpending(apartmentId, months),
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

export function useAttachments(apartmentId: string, expenseId: string) {
  return useQuery({
    queryKey: [...expenseKeys.detail(apartmentId, expenseId), 'attachments'],
    queryFn: () => fetchAttachments(expenseId),
  });
}

export function useUploadReceipt(apartmentId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({
    mutationFn: (input: { expenseId: string; receipt: PickedImage }) =>
      uploadReceipt(apartmentId, input.expenseId, input.receipt),
    onSuccess: refresh,
  });
}

/** `enabled` waits for the expense id, for screens that learn it from another query. */
export function useExpenseDetail(apartmentId: string, expenseId: string, enabled = true) {
  return useQuery({
    queryKey: expenseKeys.detail(apartmentId, expenseId),
    queryFn: () => fetchExpenseDetail(expenseId),
    enabled,
  });
}

export function useRecordBillPayment(apartmentId: string, expenseId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({
    mutationFn: (payers: Contribution[]) => recordBillPayment(expenseId, payers),
    onSuccess: refresh,
  });
}

export function useEditExpense(apartmentId: string, expenseId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({
    mutationFn: async (input: {
      expectedRevision: number;
      expense: ValidExpense;
      reason: string | null;
      /** A new collector for an unpaid bill, or undefined to leave it as it is. */
      collector?: string | null;
      /** A new label for what Other was, or undefined to leave it as it is. */
      categoryDetail?: string | null;
    }) => {
      await editExpense(expenseId, input.expectedRevision, input.expense, input.reason);
      // Who will pay and what Other was are not part of the money, so they are saved on their own.
      if (input.collector !== undefined) await setBillCollector(expenseId, input.collector);
      if (input.categoryDetail !== undefined) {
        await setExpenseCategoryDetail(expenseId, input.categoryDetail);
      }
    },
    onSuccess: refresh,
  });
}

export function useVoidExpense(apartmentId: string, expenseId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({
    mutationFn: () => voidExpense(expenseId),
    onSuccess: refresh,
  });
}

/** What the signed-in user owes and is owed by each person, gross and by state. */
export function usePairBalances(apartmentId: string) {
  return useQuery({
    queryKey: expenseKeys.pairBalances(apartmentId),
    queryFn: () => fetchPairBalances(apartmentId),
  });
}

export function usePairExpenses(apartmentId: string, counterpartyId: string) {
  return useInfiniteQuery({
    queryKey: expenseKeys.pairExpenses(apartmentId, counterpartyId),
    queryFn: ({ pageParam }) => fetchPairExpensesPage(apartmentId, counterpartyId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAIR_EXPENSES_PAGE_SIZE ? pages.length : undefined,
  });
}
