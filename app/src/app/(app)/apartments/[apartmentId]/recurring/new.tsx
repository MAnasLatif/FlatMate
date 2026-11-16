import { useApartmentId } from '@/features/apartments/hooks';
import { TemplateScreen } from '@/features/recurring/components/template-screen';

export default function AddRecurringScreen() {
  return <TemplateScreen apartmentId={useApartmentId()} templateId={null} />;
}
