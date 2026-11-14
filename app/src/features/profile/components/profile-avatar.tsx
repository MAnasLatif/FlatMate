import { Avatar } from 'heroui-native';

import { useAvatarUrl } from '../hooks';

type ProfileAvatarProps = {
  name: string | null | undefined;
  avatarPath: string | null | undefined;
  /** "xl" is the large photo on the profile screen; HeroUI's sizes stop at "lg". */
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

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

  return (
    <Avatar
      size={size === 'xl' ? 'lg' : size}
      className={size === 'xl' ? 'size-28' : undefined}
      alt={name ?? 'Profile photo'}
    >
      {avatarUrl.data ? <Avatar.Image source={{ uri: avatarUrl.data }} /> : null}
      <Avatar.Fallback classNames={size === 'xl' ? { text: 'text-3xl' } : undefined}>
        {initials || undefined}
      </Avatar.Fallback>
    </Avatar>
  );
}
