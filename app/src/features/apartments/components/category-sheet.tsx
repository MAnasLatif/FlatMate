import {
  BottomSheet,
  FieldError,
  Input,
  Label,
  TextField,
  useBottomSheetAwareHandlers,
} from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { OnlineButton } from '@/components/online-button';
import { userErrorMessage } from '@/lib/errors';

import type { Category } from '../api';
import { APARTMENT_ERROR_MESSAGES } from '../errors';
import { useCategoryActions } from '../hooks';
import { categoryNameSchema } from '../schemas';

type CategorySheetProps = {
  apartmentId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** The category to rename, or null to add a new one. */
  category: Category | null;
};

/** A drawer for adding a category, or renaming the one tapped in the list. */
export function CategorySheet({ apartmentId, isOpen, onOpenChange, category }: CategorySheetProps) {
  // Each opening starts a fresh form.
  const [openCount, setOpenCount] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setOpenCount((count) => count + 1);
  }

  return (
    // Always mounted: a sheet mounted already open does not appear.
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content keyboardBehavior="interactive" keyboardBlurBehavior="restore">
          <CategoryForm
            key={`${openCount}-${category?.id ?? 'new'}`}
            apartmentId={apartmentId}
            category={category}
            onDone={() => onOpenChange(false)}
          />
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function CategoryForm({
  apartmentId,
  category,
  onDone,
}: {
  apartmentId: string;
  category: Category | null;
  onDone: () => void;
}) {
  const { add, rename } = useCategoryActions(apartmentId);
  const { onFocus, onBlur } = useBottomSheetAwareHandlers();
  const [name, setName] = useState(category?.name ?? '');
  const [nameError, setNameError] = useState<string>();
  const saving = category ? rename : add;

  const save = () => {
    const parsed = categoryNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message);
      return;
    }
    setNameError(undefined);
    if (category === null) {
      add.mutate(parsed.data, { onSuccess: onDone });
    } else if (parsed.data === category.name) {
      onDone();
    } else {
      rename.mutate({ categoryId: category.id, name: parsed.data }, { onSuccess: onDone });
    }
  };

  const saveError = saving.error
    ? userErrorMessage(saving.error, 'Could not save the category.', APARTMENT_ERROR_MESSAGES)
    : undefined;

  return (
    <View className="gap-5">
      <BottomSheet.Title>{category ? 'Rename category' : 'New category'}</BottomSheet.Title>
      <TextField isRequired isInvalid={nameError !== undefined || saveError !== undefined}>
        <Label>Name</Label>
        {/* The grey field reads better than the white one on the white sheet. */}
        <Input
          variant="secondary"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setNameError(undefined);
            saving.reset();
          }}
          onFocus={onFocus}
          onBlur={onBlur}
          autoFocus
          placeholder="Groceries, repairs…"
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="Category name"
          testID="category-name"
        />
        <FieldError>{nameError ?? saveError}</FieldError>
      </TextField>
      <OnlineButton onPress={save} isDisabled={saving.isPending} testID="category-save">
        {saving.isPending ? 'Saving…' : category ? 'Save' : 'Add category'}
      </OnlineButton>
    </View>
  );
}
