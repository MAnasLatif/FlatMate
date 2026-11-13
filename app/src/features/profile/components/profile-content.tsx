import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, Skeleton, Typography } from 'heroui-native';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, View } from 'react-native';
import { z } from 'zod';

import { FormAlert } from '@/components/form/form-alert';
import { TextInputField } from '@/components/form/text-input-field';
import { Screen } from '@/components/screen';
import { signOut, updatePassword } from '@/features/auth/api';
import { authErrorMessage } from '@/features/auth/errors';
import {
  changePasswordSchema,
  displayNameSchema,
  PASSWORD_MIN_LENGTH,
} from '@/features/auth/schemas';
import { useCurrentUserId, useSession } from '@/features/auth/session-provider';
import { ProfileAvatar } from '@/features/profile/components/profile-avatar';
import { avatarUploadErrorMessage } from '@/features/profile/errors';
import {
  useProfile,
  useRemoveAvatar,
  useUpdateDisplayName,
  useUploadAvatar,
} from '@/features/profile/hooks';
import { userErrorMessage } from '@/lib/errors';

const nameFormSchema = z.object({ displayName: displayNameSchema });

export function ProfileContent() {
  const userId = useCurrentUserId();
  const { session } = useSession();
  const profile = useProfile(userId);

  if (profile.isPending) {
    return (
      <Screen padTop={false}>
        <View className="items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="h-5 w-40 rounded-md" />
        </View>
        <Skeleton className="h-40 rounded-xl" />
      </Screen>
    );
  }

  if (profile.isError) {
    return (
      <Screen padTop={false}>
        <FormAlert message={userErrorMessage(profile.error, 'Could not load your profile.')} />
        <Button onPress={() => profile.refetch()}>Try again</Button>
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <PhotoSection
        userId={userId}
        name={profile.data.display_name}
        avatarPath={profile.data.avatar_path}
      />
      <NameSection userId={userId} currentName={profile.data.display_name} />
      <Card>
        <Card.Body className="gap-1">
          <Typography.Paragraph type="body-sm" color="muted">
            Email
          </Typography.Paragraph>
          <Typography.Paragraph>{session?.user.email}</Typography.Paragraph>
        </Card.Body>
      </Card>
      <PasswordSection />
      <SignOutSection />
    </Screen>
  );
}

function PhotoSection({
  userId,
  name,
  avatarPath,
}: {
  userId: string;
  name: string | null;
  avatarPath: string | null;
}) {
  const upload = useUploadAvatar(userId);
  const remove = useRemoveAvatar(userId);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset) {
      upload.mutate({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
    }
  };

  const confirmRemove = () => {
    Alert.alert('Remove your photo?', 'Your flatmates will see your initials instead.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate() },
    ]);
  };

  const error = upload.error
    ? avatarUploadErrorMessage(upload.error)
    : remove.error
      ? userErrorMessage(remove.error, 'Could not remove your photo.')
      : null;

  return (
    <View className="items-center gap-3">
      <ProfileAvatar name={name} avatarPath={avatarPath} size="lg" />
      <FormAlert message={error} />
      <View className="flex-row gap-2">
        <Button
          size="sm"
          variant="secondary"
          onPress={() => void pickPhoto()}
          isDisabled={upload.isPending || remove.isPending}
        >
          {upload.isPending ? 'Uploading…' : avatarPath ? 'Change photo' : 'Add photo'}
        </Button>
        {avatarPath ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={confirmRemove}
            isDisabled={upload.isPending || remove.isPending}
          >
            Remove
          </Button>
        ) : null}
      </View>
    </View>
  );
}

function NameSection({ userId, currentName }: { userId: string; currentName: string | null }) {
  const update = useUpdateDisplayName(userId);
  const form = useForm<z.input<typeof nameFormSchema>, unknown, z.output<typeof nameFormSchema>>({
    resolver: zodResolver(nameFormSchema),
    values: { displayName: currentName ?? '' },
  });

  return (
    <Card>
      <Card.Body className="gap-4">
        {currentName ? null : (
          <FormAlert status="warning" message="Add your name so your flatmates recognise you." />
        )}
        <FormAlert
          message={
            update.error ? userErrorMessage(update.error, 'Could not save your name.') : null
          }
        />
        <FormAlert
          status="success"
          message={update.isSuccess && !form.formState.isDirty ? 'Your name was saved.' : null}
        />
        <TextInputField
          control={form.control}
          name="displayName"
          label="Your name"
          description="Your flatmates see this name."
          autoComplete="name"
          textContentType="name"
        />
        <Button
          onPress={() => void form.handleSubmit((values) => update.mutate(values.displayName))()}
          isDisabled={update.isPending || !form.formState.isDirty}
        >
          {update.isPending ? 'Saving…' : 'Save name'}
        </Button>
      </Card.Body>
    </Card>
  );
}

function PasswordSection() {
  const form = useForm<
    z.input<typeof changePasswordSchema>,
    unknown,
    z.output<typeof changePasswordSchema>
  >({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: '' },
  });
  const [saved, setSaved] = useState(false);
  const change = useMutation({
    mutationFn: (password: string) => updatePassword(password),
    onSuccess: () => {
      setSaved(true);
      form.reset();
    },
  });

  return (
    <Card>
      <Card.Body className="gap-4">
        <Card.Title>Change password</Card.Title>
        <FormAlert message={change.error ? authErrorMessage(change.error) : null} />
        <FormAlert status="success" message={saved ? 'Your password was changed.' : null} />
        <TextInputField
          control={form.control}
          name="password"
          label="New password"
          description={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          onFocus={() => setSaved(false)}
        />
        <Button
          variant="secondary"
          onPress={() => void form.handleSubmit((values) => change.mutate(values.password))()}
          isDisabled={change.isPending}
        >
          {change.isPending ? 'Saving…' : 'Change password'}
        </Button>
      </Card.Body>
    </Card>
  );
}

function SignOutSection() {
  const signOutMutation = useMutation({ mutationFn: signOut });
  return (
    <View className="gap-3">
      <FormAlert message={signOutMutation.error ? authErrorMessage(signOutMutation.error) : null} />
      <Button
        variant="danger-soft"
        onPress={() => signOutMutation.mutate()}
        isDisabled={signOutMutation.isPending}
      >
        Sign out
      </Button>
    </View>
  );
}
