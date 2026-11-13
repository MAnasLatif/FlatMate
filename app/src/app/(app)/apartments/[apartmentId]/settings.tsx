import { zodResolver } from '@hookform/resolvers/zod';
import * as Clipboard from 'expo-clipboard';
import { Button, Card, Input, Separator, TextField, Typography } from 'heroui-native';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, Share, View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { Apartment, Category } from '@/features/apartments/api';
import {
  ApartmentFormFields,
  type ApartmentFormInput,
  type ApartmentFormOutput,
} from '@/features/apartments/components/apartment-form-fields';
import { APARTMENT_ERROR_MESSAGES } from '@/features/apartments/errors';
import {
  useActiveInvites,
  useApartment,
  useApartmentId,
  useCategories,
  useCategoryActions,
  useInviteActions,
  useMyMembership,
  useUpdateApartmentSettings,
} from '@/features/apartments/hooks';
import { apartmentFormSchema, categoryNameSchema } from '@/features/apartments/schemas';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

const INVITE_VALID_DAYS = 7;

export default function ApartmentSettingsScreen() {
  const apartmentId = useApartmentId();
  const apartment = useApartment(apartmentId);
  const membership = useMyMembership(apartmentId);

  if (apartment.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={4} />
      </Screen>
    );
  }
  if (apartment.isError) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(apartment.error, 'Could not load the settings.')}
          onRetry={() => void apartment.refetch()}
        />
      </Screen>
    );
  }
  if (membership?.role !== 'admin') {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message="Only admins of this apartment can change its settings."
        />
      </Screen>
    );
  }

  return (
    <Screen padTop={false}>
      <DetailsSection apartment={apartment.data} />
      <InvitesSection apartmentId={apartmentId} apartmentName={apartment.data.name} />
      <CategoriesSection apartmentId={apartmentId} />
    </Screen>
  );
}

function DetailsSection({ apartment }: { apartment: Apartment }) {
  const update = useUpdateApartmentSettings(apartment.id);
  const form = useForm<ApartmentFormInput, unknown, ApartmentFormOutput>({
    resolver: zodResolver(apartmentFormSchema),
    values: {
      name: apartment.name,
      location: apartment.location ?? '',
      showLocation: apartment.show_location,
      currency: apartment.currency,
      timezone: apartment.timezone,
      settlementDay: String(apartment.settlement_day),
      approvalDays: String(apartment.approval_days),
    },
  });

  return (
    <Card>
      <Card.Body className="gap-4">
        <Card.Title>Details</Card.Title>
        <FormAlert
          message={
            update.error
              ? userErrorMessage(
                  update.error,
                  'Could not save the settings.',
                  APARTMENT_ERROR_MESSAGES,
                )
              : null
          }
        />
        <FormAlert
          status="success"
          message={update.isSuccess && !form.formState.isDirty ? 'Settings saved.' : null}
        />
        <ApartmentFormFields control={form.control} isCurrencyEditable={false} />
        <Typography.Paragraph type="body-xs" color="muted">
          A new settlement day applies from the next settlement period.
        </Typography.Paragraph>
        <Button
          onPress={() => void form.handleSubmit((values) => update.mutate(values))()}
          isDisabled={update.isPending || !form.formState.isDirty}
        >
          {update.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </Card.Body>
    </Card>
  );
}

function InvitesSection({
  apartmentId,
  apartmentName,
}: {
  apartmentId: string;
  apartmentName: string;
}) {
  const invites = useActiveInvites(apartmentId, true);
  const { create, revoke } = useInviteActions(apartmentId);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareCode = (code: string) =>
    Share.share({
      message: `Join ${apartmentName} on FlatMate with this code: ${code}. It works for ${INVITE_VALID_DAYS} days.`,
    });

  const confirmRevoke = (inviteId: string) => {
    Alert.alert('Revoke this code?', 'Nobody will be able to join with it any more.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => revoke.mutate(inviteId) },
    ]);
  };

  const error = create.error ?? revoke.error;

  return (
    <Card>
      <Card.Body className="gap-4">
        <Card.Title>Join codes</Card.Title>
        <Card.Description>
          Share a code with someone to let them join. Each code works for {INVITE_VALID_DAYS} days.
        </Card.Description>
        <FormAlert
          message={
            error
              ? userErrorMessage(error, 'Could not update the codes.', APARTMENT_ERROR_MESSAGES)
              : null
          }
        />

        {newCode ? (
          <View className="gap-3 rounded-xl bg-surface-secondary p-4">
            <Typography.Paragraph type="body-sm" color="muted">
              New code. Copy or share it now: it will not be shown again.
            </Typography.Paragraph>
            <Typography.Heading type="h3" className="text-center" selectable>
              {newCode}
            </Typography.Heading>
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                variant="secondary"
                onPress={() => void Clipboard.setStringAsync(newCode).then(() => setCopied(true))}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button className="flex-1" onPress={() => void shareCode(newCode)}>
                Share
              </Button>
            </View>
          </View>
        ) : null}

        <Button
          variant={newCode ? 'secondary' : 'primary'}
          onPress={() =>
            create.mutate(INVITE_VALID_DAYS, {
              onSuccess: (code) => {
                setNewCode(code);
                setCopied(false);
              },
            })
          }
          isDisabled={create.isPending}
        >
          {create.isPending ? 'Creating…' : 'Create a join code'}
        </Button>

        {invites.data && invites.data.length > 0 ? (
          <View className="gap-2">
            <Separator />
            <Typography.Paragraph type="body-sm" color="muted">
              Codes that still work
            </Typography.Paragraph>
            {invites.data.map((invite) => (
              <View key={invite.id} className="flex-row items-center justify-between gap-3">
                <Typography.Paragraph type="body-sm">
                  Created {formatDate(invite.created_at)}, expires {formatDate(invite.expires_at)}
                </Typography.Paragraph>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => confirmRevoke(invite.id)}
                  isDisabled={revoke.isPending}
                >
                  Revoke
                </Button>
              </View>
            ))}
          </View>
        ) : null}
      </Card.Body>
    </Card>
  );
}

function CategoriesSection({ apartmentId }: { apartmentId: string }) {
  const categories = useCategories(apartmentId);
  const { add, rename, archive } = useCategoryActions(apartmentId);
  const [newName, setNewName] = useState('');
  const [newNameError, setNewNameError] = useState<string | undefined>();

  const submitNew = () => {
    const parsed = categoryNameSchema.safeParse(newName);
    if (!parsed.success) {
      setNewNameError(parsed.error.issues[0]?.message);
      return;
    }
    setNewNameError(undefined);
    add.mutate(parsed.data, { onSuccess: () => setNewName('') });
  };

  const error = add.error ?? rename.error ?? archive.error;

  return (
    <Card>
      <Card.Body className="gap-4">
        <Card.Title>Expense categories</Card.Title>
        <FormAlert
          message={
            error
              ? userErrorMessage(
                  error,
                  'Could not update the categories.',
                  APARTMENT_ERROR_MESSAGES,
                )
              : null
          }
        />
        {categories.isError ? (
          <LoadError
            message={userErrorMessage(categories.error, 'Could not load the categories.')}
            onRetry={() => void categories.refetch()}
          />
        ) : null}
        <View className="gap-2">
          {categories.data?.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              onRename={(name) => rename.mutate({ categoryId: category.id, name })}
              onArchive={() => archive.mutate(category.id)}
              isBusy={rename.isPending || archive.isPending}
            />
          ))}
        </View>
        <Separator />
        <TextField isInvalid={newNameError !== undefined}>
          <Input
            value={newName}
            onChangeText={(text) => {
              setNewName(text);
              setNewNameError(undefined);
            }}
            placeholder="New category"
            accessibilityLabel="New category name"
            onSubmitEditing={submitNew}
          />
          {newNameError ? (
            <Typography.Paragraph type="body-xs" className="text-danger">
              {newNameError}
            </Typography.Paragraph>
          ) : null}
        </TextField>
        <Button variant="secondary" onPress={submitNew} isDisabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add category'}
        </Button>
      </Card.Body>
    </Card>
  );
}

type CategoryRowProps = {
  category: Category;
  onRename: (name: string) => void;
  onArchive: () => void;
  isBusy: boolean;
};

function CategoryRow({ category, onRename, onArchive, isBusy }: CategoryRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);

  const save = () => {
    const parsed = categoryNameSchema.safeParse(name);
    if (parsed.success && parsed.data !== category.name) {
      onRename(parsed.data);
    }
    setEditing(false);
  };

  const confirmArchive = () => {
    Alert.alert(
      `Archive "${category.name}"?`,
      'It will no longer be offered for new expenses. Expenses that already use it keep it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: onArchive },
      ],
    );
  };

  if (editing) {
    return (
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <TextField>
            <Input
              value={name}
              onChangeText={setName}
              autoFocus
              accessibilityLabel={`New name for ${category.name}`}
              onSubmitEditing={save}
            />
          </TextField>
        </View>
        <Button size="sm" onPress={save}>
          Save
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-2">
      <Typography.Paragraph className="flex-1">{category.name}</Typography.Paragraph>
      <Button size="sm" variant="ghost" onPress={() => setEditing(true)} isDisabled={isBusy}>
        Rename
      </Button>
      <Button size="sm" variant="ghost" onPress={confirmArchive} isDisabled={isBusy}>
        Archive
      </Button>
    </View>
  );
}
