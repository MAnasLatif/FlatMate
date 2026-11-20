import { router } from 'expo-router';
import Stack from 'expo-router/stack';
import { useEffect } from 'react';
import { BackHandler } from 'react-native';

import { HeaderBack } from '@/components/header-back';
import { useApartmentId } from '@/features/apartments/hooks';
import { SettlementOverview } from '@/features/settlement/components/settlement-overview';

export default function SettlementScreen() {
  const apartmentId = useApartmentId();
  // Shown in place of the apartment to someone removed while it was open, it
  // has nothing to go back to: back then goes to the start, which opens their
  // next apartment or the way to join one.
  const isFirstScreen = !router.canGoBack();

  useEffect(() => {
    if (!isFirstScreen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/');
      return true;
    });
    return () => subscription.remove();
  }, [isFirstScreen]);

  return (
    <>
      {isFirstScreen ? (
        <Stack.Screen
          options={{ headerLeft: () => <HeaderBack onPress={() => router.replace('/')} /> }}
        />
      ) : null}
      <SettlementOverview apartmentId={apartmentId} />
    </>
  );
}
