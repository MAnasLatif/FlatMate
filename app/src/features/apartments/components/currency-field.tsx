import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BottomSheet,
  Description,
  FieldError,
  Label,
  PressableFeedback,
  SearchField,
  TextField,
  Typography,
  useThemeColor,
} from 'heroui-native';
import { useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { type Control, useController } from 'react-hook-form';

import { Sheet } from '@/components/sheet';

import { CURRENCIES, type Currency, matchesCurrency } from '../currencies';
import type { ApartmentFormInput, ApartmentFormOutput } from './apartment-form-fields';

/**
 * Picks the apartment's currency when it is created: a field that opens a
 * searchable list of every currency in circulation, each with its symbol.
 */
export function CurrencyField({
  control,
  isLocked = false,
}: {
  control: Control<ApartmentFormInput, unknown, ApartmentFormOutput>;
  /** After creation the currency is shown but cannot be changed. */
  isLocked?: boolean;
}) {
  const { field, fieldState } = useController({ control, name: 'currency' });
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const listRef = useRef<FlatList<Currency>>(null);
  const [mutedColor, accentColor] = useThemeColor(['muted', 'accent']);
  const selected = CURRENCIES.find((currency) => currency.code === field.value);
  const results = useMemo(
    () => CURRENCIES.filter((currency) => matchesCurrency(currency, query)),
    [query],
  );

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const choose = (currency: Currency) => {
    field.onChange(currency.code);
    close();
  };

  return (
    <TextField isInvalid={fieldState.error !== undefined}>
      <Label>Currency</Label>
      <PressableFeedback
        onPress={() => setOpen(true)}
        isDisabled={isLocked}
        accessibilityState={{ disabled: isLocked }}
        accessibilityRole="button"
        accessibilityLabel={`Currency, ${selected ? `${selected.code} ${selected.name}` : 'not chosen'}`}
        accessibilityHint={isLocked ? undefined : 'Opens the list of currencies'}
        className="min-h-12 flex-row items-center gap-3 rounded-field bg-default px-3"
      >
        {selected ? (
          <>
            <CurrencySymbol symbol={selected.symbol} />
            <Typography.Paragraph className="flex-1">
              {selected.code} · {selected.name}
            </Typography.Paragraph>
          </>
        ) : (
          <Typography.Paragraph color="muted" className="flex-1">
            Choose a currency
          </Typography.Paragraph>
        )}
        <Ionicons
          name={isLocked ? 'lock-closed-outline' : 'chevron-down'}
          size={18}
          color={mutedColor}
        />
      </PressableFeedback>
      {fieldState.error ? null : (
        <Description>
          {isLocked
            ? 'All amounts in this apartment are in this currency, so it cannot be changed.'
            : 'All amounts in this apartment use this currency. It cannot be changed later.'}
        </Description>
      )}
      <FieldError>{fieldState.error?.message}</FieldError>

      <Sheet
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        detents={[0.85]}
        scrollableRef={listRef}
        style={{ flex: 1 }}
      >
        <BottomSheet.Content className="flex-1">
          {/* One flex-1 view: the sheet wraps its content in a view that grows
              but never shrinks, so loose children would run past its bottom. */}
          <View className="flex-1 gap-4">
            <BottomSheet.Title>Currency</BottomSheet.Title>
            <SearchField value={query} onChange={setQuery}>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input
                  variant="secondary"
                  placeholder="Search by name, code or symbol"
                  accessibilityLabel="Search currencies"
                  autoCorrect={false}
                />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <FlatList
              ref={listRef}
              data={results}
              keyExtractor={(currency) => currency.code}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Typography.Paragraph color="muted" className="py-6 text-center">
                  No currency matches “{query.trim()}”.
                </Typography.Paragraph>
              }
              renderItem={({ item }) => {
                const isSelected = item.code === field.value;
                return (
                  <PressableFeedback
                    onPress={() => choose(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.code} ${item.name}`}
                    accessibilityState={{ selected: isSelected }}
                    className="flex-row items-center gap-3 py-3"
                  >
                    <CurrencySymbol symbol={item.symbol} />
                    <View className="flex-1">
                      <Typography.Paragraph>{item.name}</Typography.Paragraph>
                      <Typography.Paragraph type="body-xs" color="muted">
                        {item.code}
                      </Typography.Paragraph>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark" size={20} color={accentColor} />
                    ) : null}
                  </PressableFeedback>
                );
              }}
            />
          </View>
        </BottomSheet.Content>
      </Sheet>
    </TextField>
  );
}

/** The currency's symbol in a fixed-width tile, so names line up in the list. */
function CurrencySymbol({ symbol }: { symbol: string }) {
  return (
    <View className="h-9 min-w-12 items-center justify-center rounded-lg bg-default px-1.5">
      <Typography.Paragraph type="body-sm" numberOfLines={1} className="font-semibold">
        {symbol}
      </Typography.Paragraph>
    </View>
  );
}
