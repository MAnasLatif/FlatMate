import Ionicons from '@expo/vector-icons/Ionicons';
import { Card, Typography, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

import { useConfirm } from '@/components/confirm-dialog';
import { FormAlert } from '@/components/form/form-alert';
import { OnlineButton } from '@/components/online-button';
import { LoadError, loadingError, LoadingRows } from '@/components/query-states';
import { Screen } from '@/components/screen';
import { formatMoney } from '@/features/apartments/currencies';
import { useApartment, useCategories, useMyMembership } from '@/features/apartments/hooks';
import { userErrorMessage } from '@/lib/errors';

import type { QuickAdd } from '../api';
import { QUICK_ADD_ERROR_MESSAGES } from '../errors';
import { useDeleteQuickAdd, useQuickAdds } from '../hooks';
import { describeQuickAddSplit } from '../templates';

/**
 * The apartment's quick-adds (FR-10.3). Every member sees them; anyone who
 * may add expenses deletes one here, and saves one from the Add expense form.
 */
export function QuickAddList({ apartmentId }: { apartmentId: string }) {
  const apartment = useApartment(apartmentId);
  const quickAdds = useQuickAdds(apartmentId);
  const categories = useCategories(apartmentId);
  const canEdit = useMyMembership(apartmentId)?.canAddExpense ?? false;
  const remove = useDeleteQuickAdd(apartmentId);
  const { confirm, dialog } = useConfirm();

  if (apartment.isPending || quickAdds.isPending || categories.isPending) {
    return (
      <Screen padTop={false}>
        <LoadingRows count={3} />
      </Screen>
    );
  }
  const loadError = loadingError(apartment, quickAdds, categories);
  if (loadError || !apartment.data || !quickAdds.data || !categories.data) {
    return (
      <Screen padTop={false}>
        <LoadError
          message={userErrorMessage(loadError, 'Could not load the quick-adds.')}
          onRetry={() => {
            void apartment.refetch();
            void quickAdds.refetch();
            void categories.refetch();
          }}
        />
      </Screen>
    );
  }

  const categoryNames = new Map(categories.data.map((category) => [category.id, category.name]));
  const currency = apartment.data.currency;

  return (
    <Screen freshness={quickAdds} padTop={false}>
      <Typography.Paragraph type="body-sm" color="muted">
        A quick-add fills in the name, amount, category and split of an expense you add often. To
        make one, turn on &quot;Save as a quick-add&quot; when you add an expense.
      </Typography.Paragraph>
      <FormAlert
        message={
          remove.error
            ? userErrorMessage(
                remove.error,
                'Could not delete the quick-add.',
                QUICK_ADD_ERROR_MESSAGES,
              )
            : null
        }
      />
      {quickAdds.data.length === 0 ? (
        <Typography.Paragraph color="muted" className="py-10 text-center">
          No quick-adds yet.
        </Typography.Paragraph>
      ) : null}
      {quickAdds.data.map((template) => (
        <QuickAddRow
          key={template.id}
          template={template}
          details={[
            template.amountMinor === null
              ? 'Any amount'
              : formatMoney(template.amountMinor, currency),
            template.categoryId ? categoryNames.get(template.categoryId) : undefined,
            describeQuickAddSplit(template),
          ]
            .filter((part) => part !== undefined)
            .join(' · ')}
          onDelete={
            canEdit
              ? () =>
                  confirm({
                    title: `Delete "${template.title}"?`,
                    description:
                      'It is removed for everyone in the apartment. Expenses added with it stay as they are.',
                    confirmLabel: 'Delete',
                    isDestructive: true,
                    onConfirm: () => remove.mutate(template.id),
                  })
              : undefined
          }
          isBusy={remove.isPending}
        />
      ))}
      {dialog}
    </Screen>
  );
}

function QuickAddRow({
  template,
  details,
  onDelete,
  isBusy,
}: {
  template: QuickAdd;
  details: string;
  /** Asks first, then deletes. Missing for someone who may not add expenses. */
  onDelete?: () => void;
  isBusy: boolean;
}) {
  const danger = useThemeColor('danger');
  return (
    <Card>
      <Card.Body className="flex-row items-center gap-2">
        <View className="flex-1 gap-1">
          <Typography.Paragraph weight="semibold" numberOfLines={1}>
            {template.title}
          </Typography.Paragraph>
          <Typography.Paragraph type="body-xs" color="muted">
            {details}
          </Typography.Paragraph>
        </View>
        {onDelete ? (
          <OnlineButton
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={onDelete}
            isDisabled={isBusy}
            accessibilityLabel={`Delete ${template.title}`}
          >
            <Ionicons name="trash-outline" size={22} color={danger} />
          </OnlineButton>
        ) : null}
      </Card.Body>
    </Card>
  );
}
