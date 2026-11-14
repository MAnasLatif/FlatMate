import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { FormAlert } from '@/components/form/form-alert';
import { TextInputField } from '@/components/form/text-input-field';
import { OnlineButton } from '@/components/online-button';
import { userErrorMessage } from '@/lib/errors';

import type { JoinResult } from '../api';
import { useJoinApartment } from '../hooks';
import { joinCodeSchema } from '../schemas';

const JOIN_MESSAGES: Record<'invalid_code' | 'rate_limited', string> = {
  invalid_code:
    'This code does not work. It may have expired or been replaced. Ask a flatmate for a new one.',
  rate_limited: 'Too many codes did not work. Wait 15 minutes and try again.',
};

/** Opens an apartment in place of the screen that created or joined it. */
export function openApartment(apartmentId: string) {
  router.replace({ pathname: '/apartments/[apartmentId]', params: { apartmentId } });
}

/** Enter the code a flatmate shared and join their apartment. */
export function JoinApartment() {
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
    <View className="gap-4">
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
        description="An admin of the apartment can create one for you."
        placeholder="XXXX-XXXX"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={9}
      />
      <OnlineButton
        onPress={() =>
          void form.handleSubmit((values) => join.mutate(values.code, { onSuccess: onResult }))()
        }
        isDisabled={join.isPending}
      >
        {join.isPending ? 'Joining…' : 'Join'}
      </OnlineButton>
    </View>
  );
}
