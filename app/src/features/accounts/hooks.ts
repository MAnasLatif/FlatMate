import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCurrentUserId } from '@/features/auth/session-provider';

import {
  type AccountInput,
  createAccount,
  deleteAccount,
  fetchMyAccounts,
  fetchSharedAccounts,
  setPreferredAccount,
  shareAccount,
  unshareAccount,
  updateAccount,
} from './api';

export const accountKeys = {
  mine: (userId: string) => ['accounts', 'mine', userId] as const,
  shared: (apartmentId: string, userId: string) =>
    ['accounts', 'shared', apartmentId, userId] as const,
};

export function useMyAccounts() {
  const userId = useCurrentUserId();
  return useQuery({ queryKey: accountKeys.mine(userId), queryFn: fetchMyAccounts });
}

export function useSharedAccounts(apartmentId: string, userId: string) {
  return useQuery({
    queryKey: accountKeys.shared(apartmentId, userId),
    queryFn: () => fetchSharedAccounts(apartmentId, userId),
  });
}

/** Changes to the user's accounts and where they are shared. Each refreshes the list. */
export function useAccountMutations() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['accounts'] });
  return {
    save: useMutation({
      mutationFn: (input: { accountId: string | null; account: AccountInput }) =>
        input.accountId
          ? updateAccount(input.accountId, input.account).then(() => input.accountId as string)
          : createAccount(userId, input.account),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: deleteAccount, onSuccess: refresh }),
    prefer: useMutation({
      mutationFn: (accountId: string) => setPreferredAccount(userId, accountId),
      onSuccess: refresh,
    }),
    share: useMutation({
      mutationFn: (input: { accountId: string; apartmentId: string; shared: boolean }) =>
        input.shared
          ? shareAccount(input.accountId, input.apartmentId)
          : unshareAccount(input.accountId, input.apartmentId),
      onSuccess: refresh,
    }),
  };
}
