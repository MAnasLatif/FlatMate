import { avatarPathFor } from './api';
import { initialsOf } from './components/profile-avatar';
import { avatarUploadErrorMessage } from './errors';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('avatarPathFor', () => {
  it('puts the photo in the folder named after the user', () => {
    expect(avatarPathFor('11111111-1111-1111-1111-111111111111')).toBe(
      '11111111-1111-1111-1111-111111111111/avatar',
    );
  });
});

describe('initialsOf', () => {
  it.each([
    ['Anas Latif', 'AL'],
    ['zubair', 'ZU'],
    ['  Muhammad  Ajmal  Khan ', 'MK'],
    ['', ''],
    [null, ''],
  ])('turns %p into %p', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe('avatarUploadErrorMessage', () => {
  it('explains a photo over the size limit', () => {
    expect(avatarUploadErrorMessage({ status: 413 })).toMatch(/under 5 MB/);
    expect(avatarUploadErrorMessage({ statusCode: '413' })).toMatch(/under 5 MB/);
  });

  it('reads the reason Storage gives inside an HTTP 400 response', () => {
    expect(avatarUploadErrorMessage({ status: 400, statusCode: '413' })).toMatch(/under 5 MB/);
    expect(avatarUploadErrorMessage({ status: 400, statusCode: '415' })).toMatch(
      /JPEG, PNG or WebP/,
    );
  });

  it('explains an unsupported file type', () => {
    expect(avatarUploadErrorMessage({ status: 415 })).toMatch(/JPEG, PNG or WebP/);
  });

  it('falls back to a general message', () => {
    expect(avatarUploadErrorMessage({ status: 500, message: 'internal' })).toBe(
      'Could not save your photo. Please try again.',
    );
  });
});
