import { router } from 'expo-router';
import { Button, Card, Separator, Typography } from 'heroui-native';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, loadingError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import type { Apartment, Member } from '@/features/apartments/api';
import { useApartment, useMembers, useMyMembership } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { userErrorMessage } from '@/lib/errors';
import { formatDate, todayInTimeZone } from '@/lib/time';
import { randomUuid } from '@/lib/uuid';

import type { RecurringTemplate } from '../api';
import { draftFromTemplate, newRecurringDraft, validateRecurringDraft } from '../draft';
import { RECURRING_ERROR_MESSAGES } from '../errors';
import { useRecurringTemplates, useSaveTemplate, useTemplateActions } from '../hooks';
import { TemplateForm } from './template-form';

/**
 * Adding a repeatable expense (no `templateId`) or editing one. Admins only:
 * the database refuses anyone else, and this screen says so instead of
 * showing a form that cannot be saved.
 */
export function TemplateScreen({
  apartmentId,
  templateId,
}: {
  apartmentId: string;
  templateId: string | null;
}) {
  const apartment = useApartment(apartmentId);
  const members = useMembers(apartmentId);
  const membership = useMyMembership(apartmentId);
  const isAdmin = membership?.role === 'admin';
  const templates = useRecurringTemplates(apartmentId, isAdmin && templateId !== null);

  const waitingForTemplate = templateId !== null && isAdmin && templates.isPending;
  if (apartment.isPending || members.isPending || waitingForTemplate) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={5} />
      </Screen>
    );
  }
  const loadError = loadingError(apartment, members, ...(templateId ? [templates] : []));
  if (loadError || !apartment.data || !members.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load the repeatable expense.')}
          onRetry={() => {
            void apartment.refetch();
            void members.refetch();
            void templates.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!isAdmin) {
    return (
      <Screen padTop={false}>
        <FormAlert
          status="warning"
          message="Only admins of this apartment can manage repeatable expenses."
        />
      </Screen>
    );
  }

  const template = templateId ? templates.data?.find((item) => item.id === templateId) : undefined;
  if (templateId && !template) {
    return (
      <Screen padTop={false}>
        <FormAlert status="warning" message="This repeatable expense no longer exists." />
        <Button variant="secondary" onPress={() => router.back()}>
          Go back
        </Button>
      </Screen>
    );
  }

  return (
    <TemplateEditor
      // A new form when the template is replaced by a newer copy, not on every refetch.
      key={template?.id ?? 'new'}
      apartment={apartment.data}
      members={members.data.filter((member) => member.leftAt === null)}
      template={template ?? null}
    />
  );
}

function TemplateEditor({
  apartment,
  members,
  template,
}: {
  apartment: Apartment;
  members: Member[];
  template: RecurringTemplate | null;
}) {
  const userId = useCurrentUserId();
  const today = todayInTimeZone(apartment.timezone);
  const memberIds = useMemo(() => members.map((member) => member.userId), [members]);
  const [draft, setDraft] = useState(() =>
    template ? draftFromTemplate(template, memberIds) : newRecurringDraft(today),
  );
  // One id per template being added, so a retried save cannot add it twice.
  const [requestId] = useState(randomUuid);
  const [showErrors, setShowErrors] = useState(false);
  const save = useSaveTemplate(apartment.id);
  const result = useMemo(
    () => validateRecurringDraft(draft, memberIds, today),
    [draft, memberIds, today],
  );

  const submit = () => {
    setShowErrors(true);
    if (!result.value) return;
    save.mutate(
      template
        ? { templateId: template.id, value: result.value }
        : { templateId: null, value: result.value, firstDate: result.value.firstDate, requestId },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <Screen padTop={false}>
      {template ? (
        <Typography.Paragraph type="body-sm" color="muted">
          {`Changes apply from the next ${template.kind === 'fixed' ? 'charge' : 'bill'}${
            template.isPaused ? '' : `, on ${formatDate(template.nextBillDate)}`
          }. Charges already made stay as they are; to change one, edit its expense.`}
        </Typography.Paragraph>
      ) : null}
      <TemplateForm
        draft={draft}
        setDraft={setDraft}
        result={result}
        showErrors={showErrors}
        members={members}
        currentUserId={userId}
        currency={apartment.currency}
        today={today}
        mode={template ? 'edit' : 'add'}
      />
      <FormAlert
        message={
          save.error
            ? userErrorMessage(
                save.error,
                'Could not save the repeatable expense. Please try again.',
                RECURRING_ERROR_MESSAGES,
              )
            : showErrors && !result.value
              ? 'Check the highlighted fields.'
              : null
        }
      />
      <OnlineButton onPress={submit} isDisabled={save.isPending} testID="recurring-save">
        {save.isPending ? 'Saving…' : template ? 'Save changes' : 'Add repeatable expense'}
      </OnlineButton>
      {template ? <TemplateActions apartmentId={apartment.id} template={template} /> : null}
    </Screen>
  );
}

function TemplateActions({
  apartmentId,
  template,
}: {
  apartmentId: string;
  template: RecurringTemplate;
}) {
  const { setPaused, archive } = useTemplateActions(apartmentId);
  const error = setPaused.error ?? archive.error;

  const confirmArchive = () =>
    Alert.alert(
      `Remove ${template.title}?`,
      'It stops for good. Charges already made stay, and a bill still waiting for an amount can still be entered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => archive.mutate(template.id, { onSuccess: () => router.back() }),
        },
      ],
    );

  return (
    <Card>
      <Card.Body className="gap-3">
        <FormAlert
          message={
            error ? userErrorMessage(error, 'Could not change it.', RECURRING_ERROR_MESSAGES) : null
          }
        />
        <Card.Description>
          {template.isPaused
            ? 'Paused: nothing is charged. Resuming starts from the next day still to come; the months in between are not charged.'
            : 'Pause it to stop charging for a while, such as when the flat is empty.'}
        </Card.Description>
        <OnlineButton
          variant="secondary"
          onPress={() => setPaused.mutate({ templateId: template.id, paused: !template.isPaused })}
          isDisabled={setPaused.isPending || archive.isPending}
        >
          {template.isPaused ? 'Resume' : 'Pause'}
        </OnlineButton>
        <Separator />
        <OnlineButton
          variant="danger-soft"
          onPress={confirmArchive}
          isDisabled={setPaused.isPending || archive.isPending}
        >
          Remove
        </OnlineButton>
      </Card.Body>
    </Card>
  );
}
