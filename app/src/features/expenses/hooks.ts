import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PickedImage } from '@/lib/private-images';
import { addMonths } from '@/lib/time';

import {
  editExpense,
  EXPENSES_PAGE_SIZE,
  fetchAttachments,
  fetchExpenseDetail,
  fetchExpensesPage,
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
import type { Contribution } from './split';

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
  pairBalances: (apartmentId: string) => ['money', apartmentId, 'pair-balances'] as const,
  pairExpenses: (apartmentId: string, counterpartyId: string) =>
    ['money', apartmentId, 'pair-expenses', counterpartyId] as const,
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

export function useExpenseDetail(apartmentId: string, expenseId: string) {
  return useQuery({
    queryKey: expenseKeys.detail(apartmentId, expenseId),
    queryFn: () => fetchExpenseDetail(expenseId),
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
    mutationFn: (input: {
      expectedRevision: number;
      expense: ValidExpense;
      reason: string | null;
    }) => editExpense(expenseId, input.expectedRevision, input.expense, input.reason),
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
