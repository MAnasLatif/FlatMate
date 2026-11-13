import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  CLOSED_PERIODS_PAGE_SIZE,
  fetchClosedPeriodsPage,
  fetchPairObligations,
  fetchSettlementPreview,
} from './api';

// Under the apartment's money keys, so any financial change refreshes settlement too.
export const settlementKeys = {
  preview: (apartmentId: string) => ['money', apartmentId, 'settlement-preview'] as const,
  obligations: (apartmentId: string, counterpartyId: string) =>
    ['money', apartmentId, 'obligations', counterpartyId] as const,
  history: (apartmentId: string) => ['money', apartmentId, 'settlement-history'] as const,
};

export function useSettlementPreview(apartmentId: string) {
  return useQuery({
    queryKey: settlementKeys.preview(apartmentId),
    queryFn: () => fetchSettlementPreview(apartmentId),
  });
}

export function usePairObligations(apartmentId: string, counterpartyId: string) {
  return useQuery({
    queryKey: settlementKeys.obligations(apartmentId, counterpartyId),
    queryFn: () => fetchPairObligations(apartmentId, counterpartyId),
  });
}

export function useClosedPeriods(apartmentId: string) {
  return useInfiniteQuery({
    queryKey: settlementKeys.history(apartmentId),
    queryFn: ({ pageParam }) => fetchClosedPeriodsPage(apartmentId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === CLOSED_PERIODS_PAGE_SIZE ? pages.length : undefined,
  });
}
