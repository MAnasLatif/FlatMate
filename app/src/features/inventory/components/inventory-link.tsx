import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Card, PressableFeedback, Typography, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

/** Opens the apartment's shared inventory (FR-10.5). */
export function InventoryLink({ apartmentId }: { apartmentId: string }) {
  const iconColor = useThemeColor('muted');
  return (
    <PressableFeedback
      onPress={() =>
        router.push({ pathname: '/apartments/[apartmentId]/inventory', params: { apartmentId } })
      }
      accessibilityRole="button"
      accessibilityLabel="Inventory"
      accessibilityHint="Shows the flat's things, who owns them and what they cost"
    >
      <Card>
        <Card.Body className="flex-row items-center gap-3">
          <Ionicons name="cube-outline" size={22} color={iconColor} />
          <View className="flex-1">
            <Typography.Paragraph>Inventory</Typography.Paragraph>
            <Typography.Paragraph type="body-xs" color="muted">
              Shared things, who owns them and what they cost
            </Typography.Paragraph>
          </View>
          <Ionicons name="chevron-forward" size={20} color={iconColor} />
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
