import { Avatar } from 'heroui-native';

import { useAvatarUrl } from '../hooks';

type ProfileAvatarProps = {
  name: string | null | undefined;
  avatarPath: string | null | undefined;
  /**
   * HeroUI's sizes run from "sm" to "lg". "xs" is the tab bar icon and "xl" the
   * large photo on the profile screen.
   */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
};

const EXTRA_SIZES = {
  xs: { base: 'sm', root: 'size-6', text: 'text-[9px]' },
  xl: { base: 'lg', root: 'size-28', text: 'text-3xl' },
} as const;

export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '').slice(0, 2);
  return letters.toUpperCase();
}

/** A person's photo, or their initials when there is no photo. */
export function ProfileAvatar({ name, avatarPath, size = 'md' }: ProfileAvatarProps) {
  const avatarUrl = useAvatarUrl(avatarPath);
  const initials = initialsOf(name);
  const extra = size === 'xs' || size === 'xl' ? EXTRA_SIZES[size] : undefined;

  return (
    <Avatar
      size={extra ? extra.base : (size as 'sm' | 'md' | 'lg')}
      className={extra?.root}
      alt={name ?? 'Profile photo'}
    >
      {avatarUrl.data ? <Avatar.Image source={{ uri: avatarUrl.data }} /> : null}
      <Avatar.Fallback classNames={extra ? { text: extra.text } : undefined}>
        {initials || undefined}
      </Avatar.Fallback>
    </Avatar>
  );
}
