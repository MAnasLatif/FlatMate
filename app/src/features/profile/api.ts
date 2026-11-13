import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type Profile = Pick<Tables<'profiles'>, 'id' | 'display_name' | 'avatar_path'>;

const AVATAR_BUCKET = 'avatars';
const AVATAR_URL_LIFETIME_SECONDS = 60 * 60;

/** Each user's photo lives in a folder named after their id (database policy). */
export function avatarPathFor(userId: string): string {
  return `${userId}/avatar`;
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_path')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

/**
 * The names of people the user shares or shared an apartment with, by id.
 * Row-level security returns only those; anyone else is left out.
 */
export async function fetchDisplayNames(userIds: string[]): Promise<Record<string, string | null>> {
  if (userIds.length === 0) return {};
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);
  if (error) throw error;
  return Object.fromEntries(data.map((row) => [row.id, row.display_name]));
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId);
  if (error) throw error;
}

export type PickedImage = { uri: string; mimeType: string };

export async function uploadAvatar(userId: string, image: PickedImage): Promise<void> {
  const file = await fetch(image.uri);
  const body = await file.arrayBuffer();
  const path = avatarPathFor(userId);

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, body, { contentType: image.mimeType, upsert: true });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (error) throw error;
}

export async function removeAvatar(userId: string): Promise<void> {
  // Clear the profile first, so a failed file removal never leaves the
  // profile pointing at a missing photo.
  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);
  if (error) throw error;

  const { error: removeError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([avatarPathFor(userId)]);
  if (removeError) throw removeError;
}

/** A temporary link to a private photo. */
export async function createAvatarUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, AVATAR_URL_LIFETIME_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

export const AVATAR_URL_STALE_TIME_MS = (AVATAR_URL_LIFETIME_SECONDS - 5 * 60) * 1000;
