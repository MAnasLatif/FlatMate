import * as ImagePicker from 'expo-image-picker';

import { storageStatusOf } from './errors';
import { supabase } from './supabase';
import { randomUuid } from './uuid';

/** Private buckets of photos, such as receipts and dispute evidence. Both have the same limits. */
export const PRIVATE_IMAGE_BUCKETS = ['receipts', 'dispute-evidence'] as const;
export type PrivateImageBucket = (typeof PRIVATE_IMAGE_BUCKETS)[number];

export function isPrivateImageBucket(value: unknown): value is PrivateImageBucket {
  return PRIVATE_IMAGE_BUCKETS.some((bucket) => bucket === value);
}

/** A photo chosen on the device. `id` is fixed when it is picked, so a retry reuses its path. */
export type PickedImage = { id: string; uri: string; mimeType: string };

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
/** The limits of the photo buckets, checked again by storage. */
export const IMAGE_MIME_TYPES = Object.keys(EXTENSIONS);
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** The file's path inside its folder, named by the photo's id. */
export function imagePath(folder: string, image: PickedImage): string {
  return `${folder}/${image.id}.${EXTENSIONS[image.mimeType] ?? 'jpg'}`;
}

/**
 * Lets the user choose one photo from their library. Returns null when they
 * cancel, or an error sentence when the photo breaks the bucket limits.
 */
export async function pickImage(): Promise<{ image: PickedImage } | { error: string } | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;

  const mimeType = asset.mimeType ?? 'image/jpeg';
  if (!IMAGE_MIME_TYPES.includes(mimeType)) return { error: 'Choose a JPEG, PNG or WebP photo.' };
  if (asset.fileSize !== undefined && asset.fileSize > IMAGE_MAX_BYTES) {
    return { error: 'This photo is too large. Choose one under 10 MB.' };
  }
  return { image: { id: randomUuid(), uri: asset.uri, mimeType } };
}

/**
 * Uploads a photo to a private bucket. Safe to retry: storage answers 409 when
 * an earlier attempt already uploaded this file, which counts as done.
 */
export async function uploadPrivateImage(
  bucket: PrivateImageBucket,
  path: string,
  image: PickedImage,
): Promise<void> {
  const file = await fetch(image.uri);
  const body = await file.arrayBuffer();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, body, { contentType: image.mimeType });
  if (error && storageStatusOf(error) !== 409) throw error;
}

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;
/** How long a signed link is reused before a fresh one is asked for. */
export const SIGNED_URL_STALE_TIME_MS = (SIGNED_URL_LIFETIME_SECONDS - 5 * 60) * 1000;

/** A temporary link to a private photo. Storage only gives one to people allowed to see it. */
export async function createSignedImageUrl(
  bucket: PrivateImageBucket,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_LIFETIME_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

/** Explains why a photo upload failed, using the limits of the photo buckets. */
export function photoUploadErrorReason(error: unknown): string | null {
  const status = storageStatusOf(error);
  if (status === 413) return 'This photo is too large. Choose one under 10 MB.';
  if (status === 415) return 'Choose a JPEG, PNG or WebP photo.';
  return null;
}
