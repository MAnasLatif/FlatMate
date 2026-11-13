import Stack from 'expo-router/stack';

export default function ApartmentLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="members" options={{ title: 'Members' }} />
      <Stack.Screen name="ledger/[memberId]" options={{ title: 'Balance' }} />
      <Stack.Screen name="settlement/index" options={{ title: 'Settlement' }} />
      <Stack.Screen name="leave" options={{ title: 'Leave apartment', presentation: 'modal' }} />
      <Stack.Screen name="settlement/[memberId]" options={{ title: 'Settle up' }} />
      <Stack.Screen name="settings" options={{ title: 'Apartment settings' }} />
      <Stack.Screen name="expenses/new" options={{ title: 'Add expense', presentation: 'modal' }} />
      <Stack.Screen name="expenses/[expenseId]/index" options={{ title: 'Expense' }} />
      <Stack.Screen
        name="expenses/[expenseId]/edit"
        options={{ title: 'Edit expense', presentation: 'modal' }}
      />
      <Stack.Screen
        name="expenses/[expenseId]/record-payment"
        options={{ title: 'Record payment', presentation: 'modal' }}
      />
      <Stack.Screen
        name="expenses/[expenseId]/dispute"
        options={{ title: 'Dispute expense', presentation: 'modal' }}
      />
      <Stack.Screen name="disputes/[disputeId]" options={{ title: 'Dispute' }} />
      <Stack.Screen
        name="pay/[memberId]"
        options={{ title: 'Record a payment', presentation: 'modal' }}
      />
      <Stack.Screen name="payments/[paymentId]" options={{ title: 'Payment' }} />
      <Stack.Screen name="photo" options={{ title: 'Photo', presentation: 'modal' }} />
    </Stack>
  );
}
