import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { expenseKeys } from '@/features/expenses/hooks';

import {
  answerDebtTransfer,
  type DebtTransferStep,
  fetchDebtTransfers,
  fetchSuggestions,
  proposeDebtTransfer,
} from './api';

export const debtTransferKeys = {
  /** Under the apartment's money key: they follow, and change, the debts. */
  list: (apartmentId: string) => ['money', apartmentId, 'debt-transfers'] as const,
  suggestions: (apartmentId: string) =>
    ['money', apartmentId, 'debt-transfer-suggestions'] as const,
};

export function useDebtTransfers(apartmentId: string) {
  return useQuery({
    queryKey: debtTransferKeys.list(apartmentId),
    queryFn: () => fetchDebtTransfers(apartmentId),
  });
}

export function useDebtTransferSuggestions(apartmentId: string) {
  return useQuery({
    queryKey: debtTransferKeys.suggestions(apartmentId),
    queryFn: () => fetchSuggestions(apartmentId),
  });
}

/** Applying one changes balances, so all of the apartment's money refreshes. */
function useRefreshMoney(apartmentId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: expenseKeys.apartment(apartmentId) });
}

export function useProposeDebtTransfer(apartmentId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({
    mutationFn: (input: { step: DebtTransferStep; requestId: string }) =>
      proposeDebtTransfer(apartmentId, input.step, input.requestId),
    onSettled: refresh,
  });
}

export function useAnswerDebtTransfer(apartmentId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({
    mutationFn: (input: { transferId: string; accept: boolean }) =>
      answerDebtTransfer(input.transferId, input.accept),
    onSettled: refresh,
  });
}
