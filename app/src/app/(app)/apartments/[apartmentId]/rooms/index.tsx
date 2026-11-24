import { useApartmentId } from '@/features/apartments/hooks';
import { RoomList } from '@/features/rooms/components/room-list';

export default function RoomsScreen() {
  return <RoomList apartmentId={useApartmentId()} />;
}
