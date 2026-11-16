import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { View } from 'react-native';

import { useMembers } from '@/features/apartments/hooks';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { useExpenseDetail } from '@/features/expenses/hooks';
import { memberLabel } from '@/features/expenses/member-label';
import { matchDebts } from '@/features/expenses/split';

/**
 * A way to pay each person this expense makes the user owe (SRS FR-07.1).
 * Payments settle what the two owe each other as a whole; the pay screen
 * shows the full amount.
 */
export function ExpensePayActions({
  apartmentId,
  expenseId,
}: {
  apartmentId: string;
  expenseId: string;
}) {
  const userId = useCurrentUserId();
  const expense = useExpenseDetail(apartmentId, expenseId);
  const members = useMembers(apartmentId);

  // The expense screen shows its own loading and error states.
  if (!expense.data || !members.data) return null;
  const { paidStatus, status, payers, splits } = expense.data;
  // An unpaid bill has no debts yet, and a void or disputed expense has nothing payable.
  if (paidStatus !== 'paid' || status === 'void' || status === 'disputed') return null;

  const creditors = matchDebts(payers, splits)
    .filter((debt) => debt.debtorId === userId)
    .map((debt) => debt.creditorId);
  if (creditors.length === 0) return null;

  const nameOf = (id: string) => {
    const member = members.data.find((item) => item.userId === id);
    return member ? memberLabel(member, userId) : 'a former member';
  };

  return (
    <View className="gap-2">
      {creditors.map((creditorId) => (
        <Button
          key={creditorId}
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/pay/[memberId]',
              params: { apartmentId, memberId: creditorId, expenseId },
            })
          }
        >
          {`Pay ${nameOf(creditorId)}`}
        </Button>
      ))}
    </View>
  );
}
