import { useApartmentId } from '@/features/apartments/hooks';
import { LeaveApartment } from '@/features/settlement/components/leave-apartment';

export default function LeaveApartmentScreen() {
  const apartmentId = useApartmentId();
  return <LeaveApartment apartmentId={apartmentId} />;
}
