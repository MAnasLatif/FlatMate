import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { RoomFormScreen } from '@/features/rooms/components/room-form';

export default function EditRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  return <RoomFormScreen apartmentId={useApartmentId()} roomId={roomId} />;
}
