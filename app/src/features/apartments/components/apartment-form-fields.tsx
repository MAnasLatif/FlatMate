import type { Control } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';

import { TextInputField } from '@/components/form/text-input-field';

import type { apartmentFormSchema } from '../schemas';
import { CurrencyField } from './currency-field';

export type ApartmentFormInput = z.input<typeof apartmentFormSchema>;
export type ApartmentFormOutput = z.output<typeof apartmentFormSchema>;

type ApartmentFormFieldsProps = {
  control: Control<ApartmentFormInput, unknown, ApartmentFormOutput>;
  /**
   * Both show the same fields. The currency is chosen when creating and locked
   * afterwards, since amounts already recorded are in it. The time zone is not
   * a field: creating takes the phone's, and editing keeps the apartment's, so
   * an admin abroad does not move everyone's deadlines.
   */
  mode: 'create' | 'settings';
};

/** A location, when given, is shown to members; there is no separate switch. */
export function ApartmentFormFields({ control, mode }: ApartmentFormFieldsProps) {
  return (
    <View className="gap-4">
      <TextInputField control={control} name="name" label="Apartment name" autoCapitalize="words" />
      <TextInputField
        control={control}
        name="location"
        label="Location (optional)"
        description="Such as the area or building."
        autoCapitalize="words"
      />
      <CurrencyField control={control} isLocked={mode === 'settings'} />
      <TextInputField
        control={control}
        name="settlementDay"
        label="Settlement day"
        description="The day of the month when balances are settled. Days 29 to 31 fall on the last day of shorter months."
        keyboardType="number-pad"
        maxLength={2}
      />
      <TextInputField
        control={control}
        name="approvalDays"
        label="Days to object"
        description="How long members have to object to an expense or a payment before it becomes final."
        keyboardType="number-pad"
        maxLength={2}
      />
    </View>
  );
}
