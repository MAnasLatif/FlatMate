import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';

import { useCurrentUserId } from '@/features/auth/session-provider';

import {
  addCategory,
  type ApartmentSettingsInput,
  archiveCategory,
  createApartment,
  createInvite,
  fetchActiveInvites,
  fetchApartment,
  fetchCategories,
  fetchMembers,
  fetchMyApartments,
  joinApartment,
  leaveApartment,
  type Member,
  type MemberRole,
  removeMember,
  renameCategory,
  revokeInvite,
  setMemberCanAddExpense,
  setMemberRole,
  updateApartmentSettings,
} from './api';

export const apartmentKeys = {
  mine: (userId: string) => ['apartments', 'mine', userId] as const,
  detail: (apartmentId: string) => ['apartments', apartmentId] as const,
  members: (apartmentId: string) => ['apartments', apartmentId, 'members'] as const,
  invites: (apartmentId: string) => ['apartments', apartmentId, 'invites'] as const,
  categories: (apartmentId: string) => ['apartments', apartmentId, 'categories'] as const,
};

/** The apartment id from the route, for screens inside an apartment. */
export function useApartmentId(): string {
  const { apartmentId } = useLocalSearchParams<{ apartmentId: string }>();
  if (typeof apartmentId !== 'string') {
    throw new Error('useApartmentId was used outside an apartment route.');
  }
  return apartmentId;
}

export function useMyApartments() {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: apartmentKeys.mine(userId),
    queryFn: () => fetchMyApartments(userId),
  });
}

export function useApartment(apartmentId: string) {
  return useQuery({
    queryKey: apartmentKeys.detail(apartmentId),
    queryFn: () => fetchApartment(apartmentId),
  });
}

export function useMembers(apartmentId: string) {
  return useQuery({
    queryKey: apartmentKeys.members(apartmentId),
    queryFn: () => fetchMembers(apartmentId),
  });
}

/** The signed-in user's current membership, or undefined while loading or after leaving. */
export function useMyMembership(apartmentId: string): Member | undefined {
  const userId = useCurrentUserId();
  const members = useMembers(apartmentId);
  return members.data?.find((member) => member.userId === userId && member.leftAt === null);
}

export function useCreateApartment() {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: createApartment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apartmentKeys.mine(userId) }),
  });
}

export function useJoinApartment() {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: joinApartment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apartmentKeys.mine(userId) }),
  });
}

export function useUpdateApartmentSettings(apartmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApartmentSettingsInput) => updateApartmentSettings(apartmentId, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: apartmentKeys.detail(apartmentId) }),
        queryClient.invalidateQueries({ queryKey: ['apartments', 'mine'] }),
      ]),
  });
}

export function useMemberActions(apartmentId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: apartmentKeys.members(apartmentId) });

  const setRole = useMutation({
    mutationFn: (input: { userId: string; role: MemberRole }) =>
      setMemberRole(apartmentId, input.userId, input.role),
    onSuccess: refresh,
  });
  const setCanAddExpense = useMutation({
    mutationFn: (input: { userId: string; allowed: boolean }) =>
      setMemberCanAddExpense(apartmentId, input.userId, input.allowed),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => removeMember(apartmentId, userId),
    onSuccess: refresh,
  });

  return { setRole, setCanAddExpense, remove };
}

export function useLeaveApartment(apartmentId: string) {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: () => leaveApartment(apartmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apartmentKeys.mine(userId) }),
  });
}

export function useActiveInvites(apartmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: apartmentKeys.invites(apartmentId),
    queryFn: () => fetchActiveInvites(apartmentId),
    enabled,
  });
}

export function useInviteActions(apartmentId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: apartmentKeys.invites(apartmentId) });
  const create = useMutation({
    mutationFn: (validDays: number) => createInvite(apartmentId, validDays),
    onSuccess: refresh,
  });
  const revoke = useMutation({ mutationFn: revokeInvite, onSuccess: refresh });
  return { create, revoke };
}

export function useCategories(apartmentId: string) {
  return useQuery({
    queryKey: apartmentKeys.categories(apartmentId),
    queryFn: () => fetchCategories(apartmentId),
  });
}

export function useCategoryActions(apartmentId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: apartmentKeys.categories(apartmentId) });
  const add = useMutation({
    mutationFn: (name: string) => addCategory(apartmentId, name),
    onSuccess: refresh,
  });
  const rename = useMutation({
    mutationFn: (input: { categoryId: string; name: string }) =>
      renameCategory(input.categoryId, input.name),
    onSuccess: refresh,
  });
  const archive = useMutation({ mutationFn: archiveCategory, onSuccess: refresh });
  return { add, rename, archive };
}
