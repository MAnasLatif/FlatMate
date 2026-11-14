import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const keyFor = (userId: string) => `flatmate.last-apartment.${userId}`;

/**
 * Remembers the apartment the user last opened on this device, so the app
 * opens there next time. Only an id is stored; losing it just means the app
 * opens the first apartment instead, so failures are ignored.
 */
export async function rememberLastApartment(userId: string, apartmentId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), apartmentId);
  } catch {
    // Not worth interrupting anyone over.
  }
}

async function readLastApartment(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(keyFor(userId));
  } catch {
    return null;
  }
}

/** The last opened apartment's id, once read: undefined while reading. */
export function useLastApartment(userId: string): string | null | undefined {
  const [apartmentId, setApartmentId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let isCurrent = true;
    void readLastApartment(userId).then((id) => {
      if (isCurrent) setApartmentId(id);
    });
    return () => {
      isCurrent = false;
    };
  }, [userId]);
  return apartmentId;
}

/**
 * Where the app opens: the last opened apartment if the user is still in it,
 * otherwise their first apartment, or null when they have none.
 */
export function startingApartment(
  apartmentIds: readonly string[],
  lastApartmentId: string | null,
): string | null {
  if (lastApartmentId && apartmentIds.includes(lastApartmentId)) return lastApartmentId;
  return apartmentIds[0] ?? null;
}
