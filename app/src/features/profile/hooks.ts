import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  AVATAR_URL_STALE_TIME_MS,
  createAvatarUrl,
  fetchDisplayNames,
  fetchProfile,
  type PickedImage,
  removeAvatar,
  updateDisplayName,
  uploadAvatar,
} from './api';

export const profileKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  avatarUrl: (path: string) => ['avatar-url', path] as const,
  names: (userIds: string[]) => ['profile-names', [...userIds].sort().join(',')] as const,
};

/** Names for people who may not be listed as current members, such as after someone left. */
export function useDisplayNames(userIds: string[]) {
  return useQuery({
    queryKey: profileKeys.names(userIds),
    queryFn: () => fetchDisplayNames(userIds),
    enabled: userIds.length > 0,
  });
}

export function useProfile(userId: string) {
  return useQuery({
    queryKey: profileKeys.profile(userId),
    queryFn: () => fetchProfile(userId),
  });
}

/** A temporary link to a photo, refreshed before it expires. */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: profileKeys.avatarUrl(path ?? ''),
    queryFn: () => createAvatarUrl(path as string),
    enabled: Boolean(path),
    staleTime: AVATAR_URL_STALE_TIME_MS,
  });
}

export function useUpdateDisplayName(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => updateDisplayName(userId, displayName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKeys.profile(userId) }),
  });
}

export function useUploadAvatar(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (image: PickedImage) => uploadAvatar(userId, image),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.profile(userId) }),
        // The file keeps its path, so drop the old link to show the new photo.
        queryClient.invalidateQueries({ queryKey: ['avatar-url'] }),
      ]),
  });
}

export function useRemoveAvatar(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => removeAvatar(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKeys.profile(userId) }),
  });
}
