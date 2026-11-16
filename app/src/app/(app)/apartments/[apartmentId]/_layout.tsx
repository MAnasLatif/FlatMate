import Stack from 'expo-router/stack';
import { useEffect } from 'react';

import { modalTransition, pushTransition } from '@/components/screen-transitions';
import { useApartmentId } from '@/features/apartments/hooks';
import { rememberLastApartment } from '@/features/apartments/last-apartment';
import { useCurrentUserId } from '@/features/auth/session-provider';
import { useApartmentChanges } from '@/features/sync/hooks';

export default function ApartmentLayout() {
  const apartmentId = useApartmentId();
  const userId = useCurrentUserId();
  // Every screen of an open apartment stays current through its change events.
  useApartmentChanges(apartmentId);
  // The app opens here next time.
  useEffect(() => {
    void rememberLastApartment(userId, apartmentId);
  }, [userId, apartmentId]);

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        // No line under the header.
        headerShadowVisible: false,
        ...pushTransition,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="members" options={{ title: 'Members' }} />
      <Stack.Screen name="ledger/[memberId]" options={{ title: 'Balance' }} />
      <Stack.Screen name="settlement/index" options={{ title: 'Settlement' }} />
      <Stack.Screen name="leave" options={{ title: 'Leave apartment', ...modalTransition }} />
      <Stack.Screen name="settlement/[memberId]" options={{ title: 'Settle up' }} />
      <Stack.Screen name="settings" options={{ title: 'Apartment settings' }} />
      <Stack.Screen name="expenses/new" options={{ title: 'Add expense', ...modalTransition }} />
      <Stack.Screen name="expenses/[expenseId]/index" options={{ title: 'Expense' }} />
      <Stack.Screen
        name="expenses/[expenseId]/edit"
        options={{ title: 'Edit expense', ...modalTransition }}
      />
      <Stack.Screen
        name="expenses/[expenseId]/record-payment"
        options={{ title: 'Record payment', ...modalTransition }}
      />
      <Stack.Screen
        name="expenses/[expenseId]/dispute"
        options={{ title: 'Dispute expense', ...modalTransition }}
      />
      <Stack.Screen name="disputes/[disputeId]" options={{ title: 'Dispute' }} />
      <Stack.Screen
        name="pay/[memberId]"
        options={{ title: 'Record a payment', ...modalTransition }}
      />
      <Stack.Screen name="payments/[paymentId]" options={{ title: 'Payment' }} />
      <Stack.Screen name="photo" options={{ title: 'Photo', ...modalTransition }} />
    </Stack>
  );
}
