import { storageStatusOf, userErrorMessage } from '@/lib/errors';

/** Explains why a photo upload failed, using the limits of the avatars bucket. */
export function avatarUploadErrorMessage(error: unknown): string {
  const status = storageStatusOf(error);
  if (status === 413) {
    return 'This photo is too large. Choose one under 5 MB.';
  }
  if (status === 415) {
    return 'Choose a JPEG, PNG or WebP photo.';
  }
  return userErrorMessage(error, 'Could not save your photo. Please try again.');
}
