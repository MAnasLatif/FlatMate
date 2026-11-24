import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, FieldError, Input, Label, TextField, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { currencySymbol } from '@/features/apartments/currencies';

import { DEDUCTION_REASON_MAX_LENGTH, type DeductionRow } from '../draft';

/** What the landlord kept back, each amount with its reason. */
export function DeductionFields({
  rows,
  onChange,
  currency,
  error,
}: {
  rows: DeductionRow[];
  onChange: (rows: DeductionRow[]) => void;
  currency: string;
  error?: string;
}) {
  const danger = useThemeColor('danger');
  const update = (index: number, patch: Partial<DeductionRow>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  return (
    <View className="gap-3">
      <Label>Deductions the landlord kept (optional)</Label>
      {rows.map((row, index) => (
        <View key={index} className="flex-row items-start gap-2">
          <TextField className="w-28">
            <Input
              variant="secondary"
              value={row.amount}
              onChangeText={(amount) => update(index, { amount })}
              keyboardType="decimal-pad"
              placeholder={currencySymbol(currency)}
              accessibilityLabel={`Deduction ${index + 1} amount in ${currency}`}
            />
          </TextField>
          <TextField className="flex-1">
            <Input
              variant="secondary"
              value={row.reason}
              onChangeText={(reason) => update(index, { reason })}
              placeholder="Cleaning, damage…"
              maxLength={DEDUCTION_REASON_MAX_LENGTH}
              accessibilityLabel={`Deduction ${index + 1} reason`}
            />
          </TextField>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={() => onChange(rows.filter((_, at) => at !== index))}
            accessibilityLabel={`Remove deduction ${index + 1}`}
          >
            <Ionicons name="close" size={20} color={danger} />
          </Button>
        </View>
      ))}
      <TextField isInvalid={error !== undefined}>
        <FieldError>{error}</FieldError>
      </TextField>
      <Button
        size="sm"
        variant="secondary"
        onPress={() => onChange([...rows, { amount: '', reason: '' }])}
      >
        Add a deduction
      </Button>
    </View>
  );
}
