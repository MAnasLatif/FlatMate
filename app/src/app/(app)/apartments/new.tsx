import { zodResolver } from '@hookform/resolvers/zod';
import { Typography } from 'heroui-native';
import { View } from 'react-native';
import { useForm } from 'react-hook-form';

import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { Screen } from '@/components/screen';
import {
  ApartmentFormFields,
  type ApartmentFormInput,
  type ApartmentFormOutput,
} from '@/features/apartments/components/apartment-form-fields';
import { APARTMENT_ERROR_MESSAGES } from '@/features/apartments/errors';
import { openApartment } from '@/features/apartments/components/join-apartment';
import { useCreateApartment } from '@/features/apartments/hooks';
import { apartmentFormSchema, DEFAULT_APPROVAL_DAYS } from '@/features/apartments/schemas';
import { userErrorMessage } from '@/lib/errors';
import { deviceTimeZone } from '@/lib/time';

export default function NewApartmentScreen() {
  return (
    <Screen padTop={false}>
      <CreateSection />
    </Screen>
  );
}

function CreateSection() {
  const create = useCreateApartment();
  const form = useForm<ApartmentFormInput, unknown, ApartmentFormOutput>({
    resolver: zodResolver(apartmentFormSchema),
    defaultValues: {
      name: '',
      location: '',
      currency: 'PKR',
      timezone: deviceTimeZone(),
      settlementDay: '1',
      approvalDays: String(DEFAULT_APPROVAL_DAYS),
    },
  });

  return (
    <View className="gap-4">
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
      <ApartmentFormFields control={form.control} mode="create" />
      <OnlineButton
        onPress={() =>
          void form.handleSubmit((values) =>
            create.mutate(values, { onSuccess: (apartmentId) => openApartment(apartmentId) }),
          )()
        }
        isDisabled={create.isPending}
      >
        {create.isPending ? 'Creating…' : 'Create apartment'}
      </OnlineButton>
    </View>
  );
}
