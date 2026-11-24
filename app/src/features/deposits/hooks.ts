import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { expenseKeys } from '@/features/expenses/hooks';

import {
  fetchDeposits,
  type NewDeposit,
  recordDeposit,
  refundDepositShare,
  returnDeposit,
  takeOverDepositShare,
  undoDepositAction,
} from './api';

export const depositKeys = {
  /** Under the apartment's money key: deposit actions post adjustments. */
  list: (apartmentId: string) => ['money', apartmentId, 'deposits'] as const,
};

export function useDeposits(apartmentId: string) {
  return useQuery({
    queryKey: depositKeys.list(apartmentId),
    queryFn: () => fetchDeposits(apartmentId),
  });
}

/** Every deposit action can change balances, so all of the apartment's money refreshes. */
function useRefreshMoney(apartmentId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: expenseKeys.apartment(apartmentId) });
}

export function useRecordDeposit(apartmentId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({
    mutationFn: (input: { deposit: NewDeposit; requestId: string }) =>
      recordDeposit(apartmentId, input.deposit, input.requestId),
    onSettled: refresh,
  });
}

export function useTakeOverDepositShare(apartmentId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({ mutationFn: takeOverDepositShare, onSettled: refresh });
}

export function useRefundDepositShare(apartmentId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({ mutationFn: refundDepositShare, onSettled: refresh });
}

export function useReturnDeposit(apartmentId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({ mutationFn: returnDeposit, onSettled: refresh });
}

export function useUndoDepositAction(apartmentId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({
    mutationFn: (input: { actionId: string; requestId: string }) =>
      undoDepositAction(input.actionId, input.requestId),
    onSettled: refresh,
  });
}
