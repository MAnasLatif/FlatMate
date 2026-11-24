import { ActivityList } from '@/features/activity/components/activity-list';
import { useApartmentId } from '@/features/apartments/hooks';

export default function ActivityScreen() {
  return <ActivityList apartmentId={useApartmentId()} />;
}
