import { Card, FieldError, Input, Tabs, TextField } from 'heroui-native';
import { View } from 'react-native';

import { SwitchRow } from '@/components/form/switch-row';
import type { Member } from '@/features/apartments/api';

import type { SplitInput } from '../draft';
import { memberLabel } from '../member-label';
import type { Share, SplitMethod } from '../split';
import { formatMoney } from '@/features/apartments/currencies';

const METHOD_LABELS: Record<SplitMethod, string> = {
  equal: 'Equally',
  percentage: 'By %',
  fixed: 'By amount',
};

const ALL_METHODS: readonly SplitMethod[] = ['equal', 'percentage', 'fixed'];

type SplitFieldsProps = {
  value: SplitInput;
  onChange: (patch: Partial<SplitInput>) => void;
  /** Each person's share, once the amount and split are valid. */
  shares?: readonly Share[];
  error?: string;
  members: readonly Member[];
  currentUserId: string;
  currency: string;
  /** The ways of splitting offered; a bill without a known amount cannot be split by amount. */
  methods?: readonly SplitMethod[];
};

/** Who shares an expense and how: equally, by percentage or by amount. */
export function SplitFields({
  value,
  onChange,
  shares,
  error,
  members,
  currentUserId,
  currency,
  methods = ALL_METHODS,
}: SplitFieldsProps) {
  const shareOf = new Map(shares?.map((share) => [share.userId, share.amountMinor]));

  const toggle = (userId: string, included: boolean) =>
    onChange({
      excluded: included
        ? value.excluded.filter((id) => id !== userId)
        : [...value.excluded, userId],
    });

  return (
    <Card>
      <Card.Body className="gap-4">
        <Card.Title>Split</Card.Title>
        <Tabs
          value={value.splitMethod}
          onValueChange={(method) => onChange({ splitMethod: method as SplitMethod })}
        >
          <Tabs.List>
            <Tabs.Indicator />
            {methods.map((method) => (
              <Tabs.Trigger key={method} value={method} className="min-h-12">
                <Tabs.Label>{METHOD_LABELS[method]}</Tabs.Label>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>

        {members.map((member) => {
          const included = !value.excluded.includes(member.userId);
          const label = memberLabel(member, currentUserId);
          // Read aloud with the field: "Your percentage", "Sara's percentage".
          const possessive = member.userId === currentUserId ? 'Your' : `${label}'s`;
          const share = shareOf.get(member.userId);
          return (
            <View key={member.userId} className="gap-2">
              <SwitchRow
                label={label}
                description={
                  included
                    ? share !== undefined
                      ? `Share: ${formatMoney(share, currency)}`
                      : 'Included'
                    : 'Not included'
                }
                isSelected={included}
                onSelectedChange={(selected) => toggle(member.userId, selected)}
              />
              {included && value.splitMethod === 'percentage' ? (
                <TextField>
                  <Input
                    variant="secondary"
                    value={value.percentages[member.userId] ?? ''}
                    onChangeText={(text) =>
                      onChange({ percentages: { ...value.percentages, [member.userId]: text } })
                    }
                    keyboardType="decimal-pad"
                    placeholder="%"
                    accessibilityLabel={`${possessive} percentage`}
                  />
                </TextField>
              ) : null}
              {included && value.splitMethod === 'fixed' ? (
                <TextField>
                  <Input
                    variant="secondary"
                    value={value.fixedAmounts[member.userId] ?? ''}
                    onChangeText={(text) =>
                      onChange({ fixedAmounts: { ...value.fixedAmounts, [member.userId]: text } })
                    }
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    accessibilityLabel={`${possessive} amount, in ${currency}`}
                  />
                </TextField>
              ) : null}
            </View>
          );
        })}
        {error ? <FieldError isInvalid>{error}</FieldError> : null}
      </Card.Body>
    </Card>
  );
}
