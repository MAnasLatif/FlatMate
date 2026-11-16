import Ionicons from '@expo/vector-icons/Ionicons';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import {
  Button,
  Card,
  PressableFeedback,
  Separator,
  Tabs,
  Typography,
  useThemeColor,
} from 'heroui-native';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, Share, View } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { type Apartment, type Category, INVITE_VALID_DAYS } from '@/features/apartments/api';
import {
  ApartmentFormFields,
  type ApartmentFormInput,
  type ApartmentFormOutput,
} from '@/features/apartments/components/apartment-form-fields';
import { AddMemberSheet } from '@/features/apartments/components/add-member-button';
import { CategorySheet } from '@/features/apartments/components/category-sheet';
import { JoinRequests } from '@/features/apartments/components/join-requests';
import { ManageMembers } from '@/features/apartments/components/manage-members';
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
import { apartmentFormSchema } from '@/features/apartments/schemas';
import { useMarkSeen } from '@/features/notifications/hooks';
import { unreadMatches } from '@/features/notifications/unread';
import { RecurringSection } from '@/features/recurring/components/recurring-section';
import { userErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/time';

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
  if (apartment.isLoadingError) {
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

  return <SettingsTabs apartment={apartment.data} freshness={apartment} />;
}

const SETTINGS_TABS = ['general', 'members', 'expenses', 'recurring'] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

function isSettingsTab(value: string | undefined): value is SettingsTab {
  return SETTINGS_TABS.some((tab) => tab === value);
}

/**
 * The settings in tabs, with the tab bar fixed above the page that scrolls.
 * A link can open a tab with `?tab=`, as a waiting bill's notification does.
 */
function SettingsTabs({
  apartment,
  freshness,
}: {
  apartment: Apartment;
  freshness: ReturnType<typeof useApartment>;
}) {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<SettingsTab>(isSettingsTab(params.tab) ? params.tab : 'general');

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as SettingsTab)}
      variant="secondary"
      className="flex-1 bg-background"
    >
      <Tabs.List className="px-5">
        <Tabs.ScrollView scrollAlign="center">
          <Tabs.Indicator />
          <Tabs.Trigger value="general">
            <Tabs.Label>General settings</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="members">
            <Tabs.Label>Manage members</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="expenses">
            <Tabs.Label>Expense control</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="recurring">
            <Tabs.Label>Repeatable expenses</Tabs.Label>
          </Tabs.Trigger>
        </Tabs.ScrollView>
      </Tabs.List>
      <Tabs.Content value="general" className="flex-1">
        <Screen freshness={freshness} padTop={false}>
          <DetailsSection apartment={apartment} />
        </Screen>
      </Tabs.Content>
      <Tabs.Content value="members" className="flex-1">
        <Screen padTop={false}>
          <MembersTab apartmentId={apartment.id} apartmentName={apartment.name} />
        </Screen>
      </Tabs.Content>
      <Tabs.Content value="expenses" className="flex-1">
        <Screen padTop={false}>
          <CategoriesSection apartmentId={apartment.id} />
        </Screen>
      </Tabs.Content>
      <Tabs.Content value="recurring" className="flex-1">
        <Screen padTop={false}>
          <RecurringSection apartmentId={apartment.id} currency={apartment.currency} />
        </Screen>
      </Tabs.Content>
    </Tabs>
  );
}

/**
 * Managing who is in the apartment: people asking to join, the members with
 * an admin's actions on each, adding someone, and join codes.
 */
function MembersTab({
  apartmentId,
  apartmentName,
}: {
  apartmentId: string;
  apartmentName: string;
}) {
  const [isAddingMember, setAddingMember] = useState(false);
  // Requests to join and declined invitations back are answered here.
  useMarkSeen(unreadMatches.memberAdmin(apartmentId));

  return (
    <View className="gap-6">
      <JoinRequests apartmentId={apartmentId} />
      <ManageMembers apartmentId={apartmentId} />
      <OnlineButton variant="secondary" onPress={() => setAddingMember(true)}>
        Add member
      </OnlineButton>
      <InvitesSection apartmentId={apartmentId} apartmentName={apartmentName} />
      <AddMemberSheet
        apartmentId={apartmentId}
        apartmentName={apartmentName}
        isOpen={isAddingMember}
        onOpenChange={setAddingMember}
      />
    </View>
  );
}

function DetailsSection({ apartment }: { apartment: Apartment }) {
  const update = useUpdateApartmentSettings(apartment.id);
  const form = useForm<ApartmentFormInput, unknown, ApartmentFormOutput>({
    resolver: zodResolver(apartmentFormSchema),
    values: {
      name: apartment.name,
      location: apartment.location ?? '',
      currency: apartment.currency,
      timezone: apartment.timezone,
      settlementDay: String(apartment.settlement_day),
      approvalDays: String(apartment.approval_days),
    },
  });

  return (
    <View className="gap-4">
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
      <ApartmentFormFields control={form.control} mode="settings" />
      <Typography.Paragraph type="body-xs" color="muted">
        A new settlement day applies from the next settlement period.
      </Typography.Paragraph>
      <OnlineButton
        onPress={() => void form.handleSubmit((values) => update.mutate(values))()}
        isDisabled={update.isPending || !form.formState.isDirty}
      >
        {update.isPending ? 'Saving…' : 'Save settings'}
      </OnlineButton>
    </View>
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
  const danger = useThemeColor('danger');
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

        <OnlineButton
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
        </OnlineButton>

        {invites.data && invites.data.length > 0 ? (
          <View className="gap-2">
            <Separator />
            <Typography.Paragraph type="body-sm" color="muted">
              Codes that still work
            </Typography.Paragraph>
            {invites.data.map((invite) => (
              <View key={invite.id} className="flex-row items-center justify-between gap-3">
                <Typography.Paragraph type="body-sm" className="flex-1">
                  Created {formatDate(invite.created_at)}, expires {formatDate(invite.expires_at)}
                </Typography.Paragraph>
                <OnlineButton
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onPress={() => confirmRevoke(invite.id)}
                  isDisabled={revoke.isPending}
                  accessibilityLabel={`Revoke the code created ${formatDate(invite.created_at)}`}
                >
                  <Ionicons name="close-circle-outline" size={22} color={danger} />
                </OnlineButton>
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
  const { archive } = useCategoryActions(apartmentId);
  const [isSheetOpen, setSheetOpen] = useState(false);
  // The category being renamed, or null when adding one.
  const [editing, setEditing] = useState<Category | null>(null);

  const openSheet = (category: Category | null) => {
    setEditing(category);
    setSheetOpen(true);
  };

  return (
    <View className="gap-3">
      <FormAlert
        message={
          archive.error
            ? userErrorMessage(
                archive.error,
                'Could not archive the category.',
                APARTMENT_ERROR_MESSAGES,
              )
            : null
        }
      />
      {categories.isPending ? <LoadingRows count={3} /> : null}
      {categories.isLoadingError ? (
        <LoadError
          message={userErrorMessage(categories.error, 'Could not load the categories.')}
          onRetry={() => void categories.refetch()}
        />
      ) : null}
      {categories.data?.length === 0 ? (
        <Typography.Paragraph type="body-sm" color="muted" className="text-center">
          No categories yet. Add one below.
        </Typography.Paragraph>
      ) : null}
      {categories.data?.map((category) => (
        <CategoryRow
          key={category.id}
          category={category}
          onPress={() => openSheet(category)}
          onArchive={() => archive.mutate(category.id)}
          isBusy={archive.isPending}
        />
      ))}
      <OnlineButton variant="secondary" onPress={() => openSheet(null)}>
        New category
      </OnlineButton>
      <CategorySheet
        apartmentId={apartmentId}
        isOpen={isSheetOpen}
        onOpenChange={setSheetOpen}
        category={editing}
      />
    </View>
  );
}

type CategoryRowProps = {
  category: Category;
  onPress: () => void;
  onArchive: () => void;
  isBusy: boolean;
};

/** One category as a card, like an expense on the home screen. Tapping it renames it. */
function CategoryRow({ category, onPress, onArchive, isBusy }: CategoryRowProps) {
  const danger = useThemeColor('danger');

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

  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={category.name}
      accessibilityHint="Opens it to rename"
      className="rounded-3xl"
    >
      <Card>
        <Card.Body className="flex-row items-center gap-2">
          <Typography.Paragraph numberOfLines={1} className="flex-1">
            {category.name}
          </Typography.Paragraph>
          <OnlineButton
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={confirmArchive}
            isDisabled={isBusy}
            accessibilityLabel={`Archive ${category.name}`}
          >
            <Ionicons name="archive-outline" size={22} color={danger} />
          </OnlineButton>
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
