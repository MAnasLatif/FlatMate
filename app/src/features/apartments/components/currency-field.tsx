import { Description, FieldError, Label, Select, TextField } from 'heroui-native';
import { type Control, useController } from 'react-hook-form';

import { CURRENCIES } from '../currencies';
import type { ApartmentFormInput, ApartmentFormOutput } from './apartment-form-fields';

const OPTIONS = CURRENCIES.map(({ code, name }) => ({ value: code, label: `${code} · ${name}` }));

/** Picks the apartment's currency from a list, when the apartment is created. */
export function CurrencyField({
  control,
}: {
  control: Control<ApartmentFormInput, unknown, ApartmentFormOutput>;
}) {
  const { field, fieldState } = useController({ control, name: 'currency' });
  const selected = OPTIONS.find((option) => option.value === field.value);

  return (
    <TextField isInvalid={fieldState.error !== undefined}>
      <Label>Currency</Label>
      <Select
        presentation="bottom-sheet"
        value={selected}
        onValueChange={(value) => {
          if (value && !Array.isArray(value)) field.onChange(value.value);
        }}
      >
        <Select.Trigger accessibilityLabel={`Currency, ${selected?.label ?? 'not chosen'}`}>
          <Select.Value placeholder="Choose a currency" />
          <Select.TriggerIndicator />
        </Select.Trigger>
        <Select.Portal>
          <Select.Overlay />
          <Select.Content presentation="bottom-sheet" snapPoints={['60%']}>
            <Select.ListLabel>Currency</Select.ListLabel>
            {OPTIONS.map((option) => (
              <Select.Item key={option.value} value={option.value} label={option.label} />
            ))}
          </Select.Content>
        </Select.Portal>
      </Select>
      {fieldState.error ? null : (
        <Description>
          All amounts in this apartment use this currency. It cannot be changed later.
        </Description>
      )}
      <FieldError>{fieldState.error?.message}</FieldError>
    </TextField>
  );
}
