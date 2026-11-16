import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRefreshMoney } from '@/features/expenses/hooks';

import {
  archiveTemplate,
  createTemplate,
  fetchTemplates,
  fetchWaitingBills,
  postBill,
  setTemplatePaused,
  skipBill,
  updateTemplate,
} from './api';
import type { ValidBill, ValidRecurring } from './draft';

export const recurringKeys = {
  /** Everything about an apartment's repeatable expenses. */
  apartment: (apartmentId: string) => ['apartments', apartmentId, 'recurring'] as const,
  templates: (apartmentId: string) =>
    ['apartments', apartmentId, 'recurring', 'templates'] as const,
  waiting: (apartmentId: string) => ['apartments', apartmentId, 'recurring', 'waiting'] as const,
};

/** Admins only: the database shows these to nobody else. */
export function useRecurringTemplates(apartmentId: string, enabled = true) {
  return useQuery({
    queryKey: recurringKeys.templates(apartmentId),
    queryFn: () => fetchTemplates(apartmentId),
    enabled,
  });
}

export function useWaitingBills(apartmentId: string, enabled = true) {
  return useQuery({
    queryKey: recurringKeys.waiting(apartmentId),
    queryFn: () => fetchWaitingBills(apartmentId),
    enabled,
  });
}

function useRefreshRecurring(apartmentId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: recurringKeys.apartment(apartmentId) });
}

export function useSaveTemplate(apartmentId: string) {
  const refresh = useRefreshRecurring(apartmentId);
  return useMutation({
    mutationFn: (
      input:
        | { templateId: string; value: ValidRecurring }
        | { templateId: null; value: ValidRecurring; firstDate: string; requestId: string },
    ) =>
      input.templateId === null
        ? createTemplate(apartmentId, input.value, input.firstDate, input.requestId)
        : updateTemplate(input.templateId, input.value).then(() => input.templateId),
    onSuccess: refresh,
  });
}

export function useTemplateActions(apartmentId: string) {
  const refresh = useRefreshRecurring(apartmentId);
  const setPaused = useMutation({
    mutationFn: (input: { templateId: string; paused: boolean }) =>
      setTemplatePaused(input.templateId, input.paused),
    onSuccess: refresh,
  });
  const archive = useMutation({ mutationFn: archiveTemplate, onSuccess: refresh });
  return { setPaused, archive };
}

/** Entering or skipping a waiting bill also changes the apartment's expenses. */
export function useBillActions(apartmentId: string) {
  const refreshRecurring = useRefreshRecurring(apartmentId);
  const refreshMoney = useRefreshMoney(apartmentId);
  const post = useMutation({
    mutationFn: (input: { instanceId: string; bill: ValidBill }) =>
      postBill(input.instanceId, input.bill),
    onSuccess: () => Promise.all([refreshRecurring(), refreshMoney()]),
  });
  const skip = useMutation({ mutationFn: skipBill, onSuccess: refreshRecurring });
  return { post, skip };
}
