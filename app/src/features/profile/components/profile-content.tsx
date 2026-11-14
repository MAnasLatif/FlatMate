import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Button, Separator, Skeleton, Typography } from 'heroui-native';
import { useEffect, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { FormAlert } from '@/components/form/form-alert';
import { TextInputField } from '@/components/form/text-input-field';
import { LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { MyAccountsSection } from '@/features/accounts/components/my-accounts';
import { displayNameSchema } from '@/features/auth/schemas';
import { useCurrentUserId, useSession } from '@/features/auth/session-provider';
import { ProfilePhoto } from '@/features/profile/components/profile-photo';
import { useProfile, useUpdateDisplayName } from '@/features/profile/hooks';
import { userErrorMessage } from '@/lib/errors';
import { useIsOnline } from '@/lib/network';

const nameFormSchema = z.object({ displayName: displayNameSchema });

/** How long after the last keystroke a changed name is saved. */
export const NAME_AUTOSAVE_DELAY_MS = 1500;

export function ProfileContent() {
  const userId = useCurrentUserId();
  const { session } = useSession();
  const profile = useProfile(userId);
  const isOnline = useIsOnline();

  if (profile.isPending && !isOnline) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={1} />
      </Screen>
    );
  }
  if (profile.isPending) {
    return (
      <Screen padTop={false}>
        <View className="items-center gap-4">
          <Skeleton className="size-28 rounded-full" />
          <Skeleton className="h-5 w-40 rounded-md" />
        </View>
        <Skeleton className="h-40 rounded-xl" />
      </Screen>
    );
  }

  if (profile.isLoadingError) {
    return (
      <Screen padTop={false}>
        <FormAlert message={userErrorMessage(profile.error, 'Could not load your profile.')} />
        <Button onPress={() => profile.refetch()}>Try again</Button>
      </Screen>
    );
  }

  return (
    <Screen freshness={profile} padTop={false}>
      <ProfilePhoto
        userId={userId}
        name={profile.data.display_name}
        avatarPath={profile.data.avatar_path}
      />
      <NameSection userId={userId} currentName={profile.data.display_name} />
      <View className="gap-1">
        <Typography.Paragraph type="body-sm" color="muted">
          Email
        </Typography.Paragraph>
        <Typography.Paragraph>{session?.user.email}</Typography.Paragraph>
      </View>
      <Button variant="secondary" onPress={() => router.push('/change-password')}>
        Change password
      </Button>
      <Separator />
      <MyAccountsSection />
    </Screen>
  );
}

/**
 * The display name, saved without a button: shortly after typing stops, when
 * the field loses focus, and when the screen closes with an unsaved change.
 * Offline, the change waits and is saved once the device reconnects.
 */
function NameSection({ userId, currentName }: { userId: string; currentName: string | null }) {
  const update = useUpdateDisplayName(userId);
  const isOnline = useIsOnline();
  const form = useForm<z.input<typeof nameFormSchema>, unknown, z.output<typeof nameFormSchema>>({
    resolver: zodResolver(nameFormSchema),
    values: { displayName: currentName ?? '' },
    // A refreshed profile must not overwrite what is being typed.
    resetOptions: { keepDirtyValues: true },
  });
  const typedName = useWatch({ control: form.control, name: 'displayName' });

  // The last name sent to the server (or loaded from it), so the same name is
  // never saved twice by the timer, the blur and the unmount together.
  const lastSent = useRef(currentName ?? '');
  useEffect(() => {
    lastSent.current = currentName ?? '';
  }, [currentName]);

  const save = (showErrors: boolean) => {
    if (!isOnline) return;
    const parsed = nameFormSchema.safeParse(form.getValues());
    if (!parsed.success) {
      if (showErrors) void form.trigger('displayName');
      return;
    }
    const name = parsed.data.displayName;
    if (name === lastSent.current) return;
    lastSent.current = name;
    update.mutate(name, {
      onError: () => {
        // Let the next edit or blur try again.
        lastSent.current = currentName ?? '';
      },
    });
  };
  // The timer and the unmount cleanup call the latest save through this ref.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    const timer = setTimeout(() => saveRef.current(true), NAME_AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typedName, isOnline]);

  // Leaving the screen saves a change the timer has not reached yet.
  useEffect(() => {
    const latestSave = saveRef;
    return () => latestSave.current(false);
  }, []);

  const isUnsaved = typedName.trim() !== (currentName ?? '');
  const status = update.isPending
    ? 'Saving…'
    : !isOnline && isUnsaved
      ? 'You are offline. Your name will be saved when you reconnect.'
      : update.isSuccess && !isUnsaved
        ? 'Saved. Your flatmates see this name.'
        : 'Your flatmates see this name.';

  return (
    <View className="gap-3">
      {currentName ? null : (
        <FormAlert status="warning" message="Add your name so your flatmates recognise you." />
      )}
      <FormAlert
        message={update.error ? userErrorMessage(update.error, 'Could not save your name.') : null}
      />
      <TextInputField
        control={form.control}
        name="displayName"
        label="Your name"
        description={status}
        autoComplete="name"
        textContentType="name"
        returnKeyType="done"
        onEndEditing={() => save(true)}
      />
    </View>
  );
}
