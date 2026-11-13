import { useMutation, useQuery } from '@tanstack/react-query';

import { useRefreshMoney } from '@/features/expenses/hooks';
import type { PickedImage } from '@/lib/private-images';

import {
  addEvidence,
  decideDispute,
  fetchDisputeDetail,
  fetchExpenseDisputes,
  raiseDispute,
  type RaiseDisputeInput,
  respondToDispute,
  withdrawDispute,
} from './api';

// Under the apartment's money keys, so any financial change refreshes disputes too.
export const disputeKeys = {
  forExpense: (apartmentId: string, expenseId: string) =>
    ['money', apartmentId, 'disputes', expenseId] as const,
  detail: (apartmentId: string, disputeId: string) =>
    ['money', apartmentId, 'dispute', disputeId] as const,
};

export function useExpenseDisputes(apartmentId: string, expenseId: string) {
  return useQuery({
    queryKey: disputeKeys.forExpense(apartmentId, expenseId),
    queryFn: () => fetchExpenseDisputes(expenseId),
  });
}

export function useDisputeDetail(apartmentId: string, disputeId: string) {
  return useQuery({
    queryKey: disputeKeys.detail(apartmentId, disputeId),
    queryFn: () => fetchDisputeDetail(disputeId),
  });
}

/** Raising, answering, withdrawing and deciding all change balances, so each refreshes them. */
export function useRaiseDispute(apartmentId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return useMutation({
    mutationFn: (input: RaiseDisputeInput) => raiseDispute(input),
    onSuccess: refresh,
  });
}

export function useDisputeActions(apartmentId: string, disputeId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return {
    respond: useMutation({
      mutationFn: (input: { accept: boolean; message: string | null }) =>
        respondToDispute(disputeId, input.accept, input.message),
      onSuccess: refresh,
    }),
    withdraw: useMutation({
      mutationFn: () => withdrawDispute(disputeId),
      onSuccess: refresh,
    }),
    decide: useMutation({
      mutationFn: (input: { apply: boolean; message: string }) =>
        decideDispute(disputeId, input.apply, input.message),
      onSuccess: refresh,
    }),
    addEvidence: useMutation({
      mutationFn: (image: PickedImage) => addEvidence(apartmentId, disputeId, image),
      onSuccess: refresh,
    }),
  };
}
