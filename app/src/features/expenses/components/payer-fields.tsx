import { FieldError, Input, Label, TextField } from 'heroui-native';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import type { Member } from '@/features/apartments/api';

import type { PayerInput } from '../draft';
import { memberLabel } from '../member-label';

/** Who paid: one member, or several with what each of them paid. */
export function PayerFields({
  value,
  onChange,
  members,
  currentUserId,
  currency,
  error,
}: {
  value: PayerInput;
  onChange: (patch: Partial<PayerInput>) => void;
  /** Members who can be recorded as payers. */
  members: Member[];
  currentUserId: string;
  currency: string;
  error?: string;
}) {
  return (
    <View className="gap-3">
      <Label>Who paid?</Label>
      <ChoiceChips
        accessibilityLabel="Who paid"
        choices={[
          ...members.map((member) => ({
            value: member.userId,
            label: memberLabel(member, currentUserId),
          })),
          { value: 'several', label: 'Several people' },
        ]}
        selected={value.payerMode === 'multiple' ? 'several' : value.payerId}
        onSelect={(selected) =>
          selected === 'several'
            ? onChange({ payerMode: 'multiple' })
            : onChange({ payerMode: 'single', payerId: selected })
        }
      />
      {value.payerMode === 'multiple'
        ? members.map((member) => (
            <TextField key={member.userId}>
              <Label>{memberLabel(member, currentUserId)} paid</Label>
              <Input
                value={value.payerAmounts[member.userId] ?? ''}
                onChangeText={(text) =>
                  onChange({ payerAmounts: { ...value.payerAmounts, [member.userId]: text } })
                }
                keyboardType="decimal-pad"
                placeholder="0.00"
                accessibilityLabel={`${memberLabel(member, currentUserId)} paid, in ${currency}`}
              />
            </TextField>
          ))
        : null}
      {error ? <FieldError isInvalid>{error}</FieldError> : null}
    </View>
  );
}
