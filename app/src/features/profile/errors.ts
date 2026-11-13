import { userErrorMessage } from '@/lib/errors';

/**
 * The status that explains a failed storage request. Storage answers some
 * failures with HTTP 400 and puts the real reason (such as 413) in statusCode,
 * so statusCode wins when present.
 */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('statusCode' in error && typeof error.statusCode === 'string') {
    const parsed = Number.parseInt(error.statusCode, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if ('status' in error && typeof error.status === 'number') return error.status;
  return undefined;
}

/** Explains why a photo upload failed, using the limits of the avatars bucket. */
export function avatarUploadErrorMessage(error: unknown): string {
  const status = statusOf(error);
  if (status === 413) {
    return 'This photo is too large. Choose one under 5 MB.';
  }
  if (status === 415) {
    return 'Choose a JPEG, PNG or WebP photo.';
  }
  return userErrorMessage(error, 'Could not save your photo. Please try again.');
}
