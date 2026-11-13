import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';

import { useCurrentUserId } from '@/features/auth/session-provider';
import { useRefreshMoney } from '@/features/expenses/hooks';
import type { PickedImage } from '@/lib/private-images';

import {
  addPaymentProof,
  declinePayment,
  fetchPairPaymentsPage,
  fetchPaymentDetail,
  netOff,
  PAIR_PAYMENTS_PAGE_SIZE,
  recordPayment,
  type RecordPaymentInput,
  voidPayment,
  withdrawPaymentDecline,
} from './api';

// Under the apartment's money keys, so any financial change refreshes payments too.
export const paymentKeys = {
  pair: (apartmentId: string, counterpartyId: string) =>
    ['money', apartmentId, 'payments', counterpartyId] as const,
  detail: (apartmentId: string, paymentId: string) =>
    ['money', apartmentId, 'payment', paymentId] as const,
};

export function usePairPayments(apartmentId: string, counterpartyId: string) {
  const userId = useCurrentUserId();
  return useInfiniteQuery({
    queryKey: paymentKeys.pair(apartmentId, counterpartyId),
    queryFn: ({ pageParam }) =>
      fetchPairPaymentsPage(apartmentId, userId, counterpartyId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAIR_PAYMENTS_PAGE_SIZE ? pages.length : undefined,
  });
}

export function usePaymentDetail(apartmentId: string, paymentId: string) {
  return useQuery({
    queryKey: paymentKeys.detail(apartmentId, paymentId),
    queryFn: () => fetchPaymentDetail(paymentId),
  });
}

/** Every step changes balances, so each refreshes them. */
export function usePaymentMutations(apartmentId: string) {
  const refresh = useRefreshMoney(apartmentId);
  return {
    netOff: useMutation({
      mutationFn: (input: { counterpartyId: string; amountMinor: number; requestId: string }) =>
        netOff(apartmentId, input.counterpartyId, input.amountMinor, input.requestId),
      onSuccess: refresh,
    }),
    record: useMutation({
      mutationFn: (input: RecordPaymentInput) => recordPayment(input),
      onSuccess: refresh,
    }),
    addProof: useMutation({
      mutationFn: (input: { paymentId: string; image: PickedImage }) =>
        addPaymentProof(apartmentId, input.paymentId, input.image),
      onSuccess: refresh,
    }),
    decline: useMutation({
      mutationFn: (input: { paymentId: string; reason: string }) =>
        declinePayment(input.paymentId, input.reason),
      onSuccess: refresh,
    }),
    withdrawDecline: useMutation({
      mutationFn: (objectionId: string) => withdrawPaymentDecline(objectionId),
      onSuccess: refresh,
    }),
    void: useMutation({
      mutationFn: (paymentId: string) => voidPayment(paymentId),
      onSuccess: refresh,
    }),
  };
}
