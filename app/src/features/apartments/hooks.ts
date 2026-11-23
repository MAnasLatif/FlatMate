import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';

import { useCurrentUserId } from '@/features/auth/session-provider';

import {
  addCategory,
  answerRejoinInvite,
  type ApartmentSettingsInput,
  archiveCategory,
  createApartment,
  changeJoinCode,
  cancelJoinRequest,
  cancelRejoinInvite,
  decideJoinRequest,
  fetchJoinCode,
  fetchApartment,
  fetchCategories,
  fetchJoinRequests,
  fetchMembers,
  fetchMyApartments,
  fetchMyJoinRequests,
  fetchMyRejoinInvites,
  fetchRejoinInvites,
  hideFormerMember,
  inviteBack,
  joinApartment,
  leaveApartment,
  type Member,
  type MemberRole,
  removeMember,
  renameCategory,
  sendInviteEmail,
  setMemberCanAddExpense,
  setMemberRole,
  type Apartment,
  updateApartmentReminders,
  updateApartmentSettings,
} from './api';
import type { ReminderSchedule } from './reminders';

export const apartmentKeys = {
  mine: (userId: string) => ['apartments', 'mine', userId] as const,
  detail: (apartmentId: string) => ['apartments', apartmentId] as const,
  members: (apartmentId: string) => ['apartments', apartmentId, 'members'] as const,
  invites: (apartmentId: string) => ['apartments', apartmentId, 'invites'] as const,
  categories: (apartmentId: string) => ['apartments', apartmentId, 'categories'] as const,
  joinRequests: (apartmentId: string) => ['apartments', apartmentId, 'join-requests'] as const,
  myJoinRequests: (userId: string) => ['apartments', 'join-requests', userId] as const,
  rejoinInvites: (apartmentId: string) => ['apartments', apartmentId, 'rejoin-invites'] as const,
  myRejoinInvites: (userId: string) => ['apartments', 'rejoin-invites', userId] as const,
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

/**
 * Whether the user has left the apartment or been removed from it. False
 * until the members have been fetched since the screen opened, so nothing is
 * taken away on a guess or on a saved copy from before they rejoined.
 */
export function useIsFormerMember(apartmentId: string): boolean {
  const members = useMembers(apartmentId);
  const membership = useMyMembership(apartmentId);
  return members.isFetchedAfterMount && membership === undefined;
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
    mutationFn: (code: string) => joinApartment(code),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: apartmentKeys.mine(userId) }),
        queryClient.invalidateQueries({ queryKey: apartmentKeys.myJoinRequests(userId) }),
      ]),
  });
}

/** The user's requests to join apartments that an admin has not decided yet. */
export function useMyJoinRequests() {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: apartmentKeys.myJoinRequests(userId),
    queryFn: fetchMyJoinRequests,
  });
}

export function useCancelJoinRequest() {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (requestId: string) => cancelJoinRequest(requestId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: apartmentKeys.myJoinRequests(userId) }),
  });
}

/** People asking to join, for an apartment's admins. */
export function useJoinRequests(apartmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: apartmentKeys.joinRequests(apartmentId),
    queryFn: () => fetchJoinRequests(apartmentId),
    enabled,
  });
}

export function useDecideJoinRequest(apartmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { requestId: string; approve: boolean }) =>
      decideJoinRequest(input.requestId, input.approve),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: apartmentKeys.joinRequests(apartmentId) }),
        queryClient.invalidateQueries({ queryKey: apartmentKeys.members(apartmentId) }),
      ]),
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

/**
 * Sets the apartment's reminder schedule. The new choice shows at once and
 * goes back if saving fails.
 */
export function useUpdateApartmentReminders(apartmentId: string) {
  const queryClient = useQueryClient();
  const key = apartmentKeys.detail(apartmentId);
  return useMutation({
    mutationFn: (schedule: ReminderSchedule) => updateApartmentReminders(apartmentId, schedule),
    onMutate: async (schedule) => {
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      const previous = queryClient.getQueryData<Apartment>(key);
      if (previous) {
        queryClient.setQueryData<Apartment>(key, {
          ...previous,
          due_reminder_days: schedule.dueReminderDays,
          settlement_reminder_days: schedule.settlementReminderDays,
        });
      }
      return { previous };
    },
    onError: (_error, _schedule, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key, exact: true }),
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

/** Invitations to rejoin that wait for an answer, for the apartment's admins. */
export function useRejoinInvites(apartmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: apartmentKeys.rejoinInvites(apartmentId),
    queryFn: () => fetchRejoinInvites(apartmentId),
    enabled,
  });
}

/** An admin's actions on a former member: invite them back, or hide them from the list. */
export function useFormerMemberActions(apartmentId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: apartmentKeys.rejoinInvites(apartmentId) }),
      queryClient.invalidateQueries({ queryKey: apartmentKeys.members(apartmentId) }),
    ]);
  const inviteBackMutation = useMutation({
    mutationFn: (userId: string) => inviteBack(apartmentId, userId),
    onSuccess: refresh,
  });
  const cancelInvite = useMutation({ mutationFn: cancelRejoinInvite, onSuccess: refresh });
  const hide = useMutation({
    mutationFn: (userId: string) => hideFormerMember(apartmentId, userId),
    onSuccess: refresh,
  });
  return { inviteBack: inviteBackMutation, cancelInvite, hide };
}

/** Invitations to the signed-in user to rejoin apartments they left. */
export function useMyRejoinInvites() {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: apartmentKeys.myRejoinInvites(userId),
    queryFn: fetchMyRejoinInvites,
  });
}

export function useAnswerRejoinInvite() {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: (input: { inviteId: string; accept: boolean }) =>
      answerRejoinInvite(input.inviteId, input.accept),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: apartmentKeys.myRejoinInvites(userId) }),
        queryClient.invalidateQueries({ queryKey: apartmentKeys.mine(userId) }),
      ]),
  });
}

export function useLeaveApartment(apartmentId: string) {
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();
  return useMutation({
    mutationFn: () => leaveApartment(apartmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apartmentKeys.mine(userId) }),
  });
}

/** The apartment's one join code, for admins: shown in the settings and shared from Add member. */
export function useJoinCode(apartmentId: string, enabled: boolean) {
  return useQuery({
    queryKey: apartmentKeys.invites(apartmentId),
    queryFn: () => fetchJoinCode(apartmentId),
    enabled,
  });
}

export function useJoinCodeActions(apartmentId: string) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: () => changeJoinCode(apartmentId),
    onSuccess: (code) => queryClient.setQueryData(apartmentKeys.invites(apartmentId), code),
  });
  const sendEmail = useMutation({
    mutationFn: (email: string) => sendInviteEmail(apartmentId, email),
  });
  return { change, sendEmail };
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
