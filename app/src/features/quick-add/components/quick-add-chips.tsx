import { router } from 'expo-router';
import { Label, LinkButton, Typography } from 'heroui-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';

import type { QuickAdd } from '../api';
import { useQuickAdds } from '../hooks';

/**
 * The apartment's quick-adds at the top of the Add expense form (FR-10.3).
 * Tapping one fills in the form, which the user checks before saving. Shows
 * nothing until the apartment has one.
 */
export function QuickAddChips({
  apartmentId,
  onPick,
}: {
  apartmentId: string;
  onPick: (template: QuickAdd) => void;
}) {
  const quickAdds = useQuickAdds(apartmentId);
  const [pickedId, setPickedId] = useState<string | null>(null);

  if (quickAdds.isLoadingError) {
    return (
      <View className="flex-row items-center justify-between gap-2">
        <Typography.Paragraph type="body-sm" color="muted" className="flex-1">
          Could not load the quick-adds.
        </Typography.Paragraph>
        <LinkButton onPress={() => void quickAdds.refetch()} hitSlop={12}>
          <LinkButton.Label className="font-semibold text-accent">Try again</LinkButton.Label>
        </LinkButton>
      </View>
    );
  }
  // Nothing while loading, so a form without quick-adds never jumps.
  if (!quickAdds.data || quickAdds.data.length === 0) return null;

  const templates = quickAdds.data;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Label>Quick add</Label>
        <LinkButton
          onPress={() =>
            router.push({
              pathname: '/apartments/[apartmentId]/quick-adds',
              params: { apartmentId },
            })
          }
          accessibilityLabel="Manage quick-adds"
          hitSlop={12}
        >
          <LinkButton.Label className="font-semibold text-accent">Manage</LinkButton.Label>
        </LinkButton>
      </View>
      <ChoiceChips
        accessibilityLabel="Quick add"
        choices={templates.map((template) => ({ value: template.id, label: template.title }))}
        selected={pickedId}
        onSelect={(id) => {
          const template = templates.find((item) => item.id === id);
          if (!template) return;
          setPickedId(id);
          onPick(template);
        }}
      />
    </View>
  );
}
