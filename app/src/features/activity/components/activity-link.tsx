import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Card, PressableFeedback, Typography, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

/** Opens the apartment's timeline of who did what (FR-10.8). */
export function ActivityLink({ apartmentId }: { apartmentId: string }) {
  const iconColor = useThemeColor('muted');

  return (
    <PressableFeedback
      onPress={() =>
        router.push({ pathname: '/apartments/[apartmentId]/activity', params: { apartmentId } })
      }
      accessibilityRole="button"
      accessibilityLabel="Activity"
      accessibilityHint="Shows who added, changed, disputed, paid and settled what"
    >
      <Card>
        <Card.Body className="flex-row items-center gap-3">
          <Ionicons name="time-outline" size={22} color={iconColor} />
          <View className="flex-1">
            <Typography.Paragraph>Activity</Typography.Paragraph>
            <Typography.Paragraph type="body-xs" color="muted">
              Who added, changed, disputed, paid and settled what
            </Typography.Paragraph>
          </View>
          <Ionicons name="chevron-forward" size={20} color={iconColor} />
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
