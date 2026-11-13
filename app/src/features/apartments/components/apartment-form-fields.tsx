import type { Control } from 'react-hook-form';
import { View } from 'react-native';
import type { z } from 'zod';

import { SwitchField } from '@/components/form/switch-field';
import { TextInputField } from '@/components/form/text-input-field';

import type { apartmentFormSchema } from '../schemas';

export type ApartmentFormInput = z.input<typeof apartmentFormSchema>;
export type ApartmentFormOutput = z.output<typeof apartmentFormSchema>;

type ApartmentFormFieldsProps = {
  control: Control<ApartmentFormInput, unknown, ApartmentFormOutput>;
  /** The currency is chosen once, when the apartment is created. */
  isCurrencyEditable: boolean;
};

export function ApartmentFormFields({ control, isCurrencyEditable }: ApartmentFormFieldsProps) {
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
      <SwitchField control={control} name="showLocation" label="Show the location to members" />
      <TextInputField
        control={control}
        name="currency"
        label="Currency"
        description={
          isCurrencyEditable
            ? 'All amounts in this apartment use this currency. It cannot be changed later.'
            : 'The currency cannot be changed.'
        }
        autoCapitalize="characters"
        maxLength={3}
        editable={isCurrencyEditable}
      />
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
      <TextInputField
        control={control}
        name="timezone"
        label="Time zone"
        description="Settlement days and deadlines follow this time zone."
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}
