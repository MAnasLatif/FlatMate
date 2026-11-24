import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteQuickAdd, fetchQuickAdds, type QuickAddInput, saveQuickAdd } from './api';

export const quickAddKeys = {
  list: (apartmentId: string) => ['apartments', apartmentId, 'quick-adds'] as const,
};

export function useQuickAdds(apartmentId: string) {
  return useQuery({
    queryKey: quickAddKeys.list(apartmentId),
    queryFn: () => fetchQuickAdds(apartmentId),
  });
}

export function useSaveQuickAdd(apartmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuickAddInput) => saveQuickAdd(apartmentId, input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: quickAddKeys.list(apartmentId) }),
  });
}

export function useDeleteQuickAdd(apartmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteQuickAdd,
    onSettled: () => queryClient.invalidateQueries({ queryKey: quickAddKeys.list(apartmentId) }),
  });
}
