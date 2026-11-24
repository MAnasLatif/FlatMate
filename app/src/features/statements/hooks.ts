import { useMutation, useQuery } from '@tanstack/react-query';

import { fetchStatementPeriods } from './api';
import { type ExportRequest, exportPdf } from './export';

export const statementKeys = {
  // Under the apartment's money key, so a closed period appears at once.
  periods: (apartmentId: string) => ['money', apartmentId, 'statement-periods'] as const,
};

export function useStatementPeriods(apartmentId: string) {
  return useQuery({
    queryKey: statementKeys.periods(apartmentId),
    queryFn: () => fetchStatementPeriods(apartmentId),
  });
}

export function useExportPdf() {
  return useMutation({ mutationFn: (request: ExportRequest) => exportPdf(request) });
}
