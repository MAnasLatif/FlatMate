import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { RoomDetail } from '@/features/rooms/components/room-detail';

export default function RoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  return <RoomDetail apartmentId={useApartmentId()} roomId={roomId} />;
}
