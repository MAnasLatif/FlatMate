import Stack from 'expo-router/stack';

export default function ApartmentLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="members" options={{ title: 'Members' }} />
      <Stack.Screen name="settings" options={{ title: 'Apartment settings' }} />
      <Stack.Screen name="expenses/new" options={{ title: 'Add expense', presentation: 'modal' }} />
      <Stack.Screen name="expenses/[expenseId]/index" options={{ title: 'Expense' }} />
      <Stack.Screen
        name="expenses/[expenseId]/record-payment"
        options={{ title: 'Record payment', presentation: 'modal' }}
      />
      <Stack.Screen name="receipt" options={{ title: 'Receipt', presentation: 'modal' }} />
    </Stack>
  );
}
