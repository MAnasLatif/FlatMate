import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Button, Card, Typography } from 'heroui-native';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { FormAlert } from '@/components/form/form-alert';
import { TextInputField } from '@/components/form/text-input-field';
import { Screen } from '@/components/screen';
import type { JoinResult } from '@/features/apartments/api';
import {
  ApartmentFormFields,
  type ApartmentFormInput,
  type ApartmentFormOutput,
} from '@/features/apartments/components/apartment-form-fields';
import { APARTMENT_ERROR_MESSAGES } from '@/features/apartments/errors';
import { useCreateApartment, useJoinApartment } from '@/features/apartments/hooks';
import {
  apartmentFormSchema,
  DEFAULT_APPROVAL_DAYS,
  joinCodeSchema,
} from '@/features/apartments/schemas';
import { userErrorMessage } from '@/lib/errors';
import { deviceTimeZone } from '@/lib/time';

function openApartment(apartmentId: string) {
  router.replace({ pathname: '/apartments/[apartmentId]', params: { apartmentId } });
}

export default function NewApartmentScreen() {
  return (
    <Screen padTop={false}>
      <JoinSection />
      <CreateSection />
    </Screen>
  );
}

const JOIN_MESSAGES: Record<'invalid_code' | 'rate_limited', string> = {
  invalid_code:
    'This code does not work. It may have expired or been replaced. Ask a flatmate for a new one.',
  rate_limited: 'Too many codes did not work. Wait 15 minutes and try again.',
};

function JoinSection() {
  const join = useJoinApartment();
  const form = useForm<z.input<typeof joinCodeSchema>, unknown, z.output<typeof joinCodeSchema>>({
    resolver: zodResolver(joinCodeSchema),
    defaultValues: { code: '' },
  });

  const onResult = (result: JoinResult) => {
    if (result.status === 'joined' || result.status === 'already_member') {
      openApartment(result.apartment_id);
    }
  };

  const resultMessage =
    join.data && (join.data.status === 'invalid_code' || join.data.status === 'rate_limited')
      ? JOIN_MESSAGES[join.data.status]
      : null;

  return (
    <Card>
      <Card.Body className="gap-4">
        <Card.Title>Join with a code</Card.Title>
        <Card.Description>An admin of the apartment can create a code for you.</Card.Description>
        <FormAlert
          message={
            join.error
              ? userErrorMessage(join.error, 'Could not join. Please try again.')
              : resultMessage
          }
        />
        <TextInputField
          control={form.control}
          name="code"
          label="Join code"
          placeholder="XXXX-XXXX"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
        />
        <Button
          onPress={() =>
            void form.handleSubmit((values) => join.mutate(values.code, { onSuccess: onResult }))()
          }
          isDisabled={join.isPending}
        >
          {join.isPending ? 'Joining…' : 'Join'}
        </Button>
      </Card.Body>
    </Card>
  );
}

function CreateSection() {
  const create = useCreateApartment();
  const form = useForm<ApartmentFormInput, unknown, ApartmentFormOutput>({
    resolver: zodResolver(apartmentFormSchema),
    defaultValues: {
      name: '',
      location: '',
      showLocation: false,
      currency: 'PKR',
      timezone: deviceTimeZone(),
      settlementDay: '1',
      approvalDays: String(DEFAULT_APPROVAL_DAYS),
    },
  });

  return (
    <Card>
      <Card.Body className="gap-4">
        <Card.Title>Create an apartment</Card.Title>
        <Typography.Paragraph type="body-sm" color="muted">
          You become its admin and can invite your flatmates.
        </Typography.Paragraph>
        <FormAlert
          message={
            create.error
              ? userErrorMessage(
                  create.error,
                  'Could not create the apartment. Please try again.',
                  APARTMENT_ERROR_MESSAGES,
                )
              : null
          }
        />
        <ApartmentFormFields control={form.control} isCurrencyEditable />
        <Button
          onPress={() =>
            void form.handleSubmit((values) =>
              create.mutate(values, { onSuccess: (apartmentId) => openApartment(apartmentId) }),
            )()
          }
          isDisabled={create.isPending}
        >
          {create.isPending ? 'Creating…' : 'Create apartment'}
        </Button>
      </Card.Body>
    </Card>
  );
}
