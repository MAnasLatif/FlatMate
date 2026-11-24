import { useApartmentId } from '@/features/apartments/hooks';
import { RoomFormScreen } from '@/features/rooms/components/room-form';

export default function NewRoomScreen() {
  return <RoomFormScreen apartmentId={useApartmentId()} />;
}
