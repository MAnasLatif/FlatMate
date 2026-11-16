import { useLocalSearchParams } from 'expo-router';

import { useApartmentId } from '@/features/apartments/hooks';
import { TemplateScreen } from '@/features/recurring/components/template-screen';

export default function EditRecurringScreen() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  return <TemplateScreen apartmentId={useApartmentId()} templateId={templateId} />;
}
