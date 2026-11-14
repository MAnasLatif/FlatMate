import Ionicons from '@expo/vector-icons/Ionicons';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Button, useThemeColor } from 'heroui-native';
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
    // Only pressing Join checks the code; typing does not turn it red.
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });

  const accent = useThemeColor('accent');

  const paste = async () => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) return;
    form.setValue('code', text.slice(0, 9), { shouldDirty: true });
    form.clearErrors('code');
  };

  const onResult = (result: JoinResult) => {
    if (result.status === 'joined' || result.status === 'already_member') {
      openApartment(result.apartment_id);
    } else if (result.status === 'requested' || result.status === 'pending') {
      form.reset();
    }
  };

  const sentMessage =
    join.data?.status === 'requested'
      ? `Request sent. An admin of ${join.data.apartment_name} will let you in.`
      : join.data?.status === 'pending'
        ? `You already asked to join ${join.data.apartment_name}. An admin will let you in.`
        : null;
  const resultMessage =
    join.data && (join.data.status === 'invalid_code' || join.data.status === 'rate_limited')
      ? JOIN_MESSAGES[join.data.status]
      : null;

  return (
    <View className="gap-4">
      <FormAlert status="success" message={sentMessage} />
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
        // Leaving the field clears the error until Join is pressed again.
        onEndEditing={() => form.clearErrors('code')}
        endContent={
          <Button
            size="sm"
            variant="ghost"
            onPress={() => void paste()}
            accessibilityLabel="Paste join code"
          >
            <Ionicons name="clipboard-outline" size={16} color={accent} />
            <Button.Label>Paste</Button.Label>
          </Button>
        }
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
