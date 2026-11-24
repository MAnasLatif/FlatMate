import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Card, PressableFeedback, Typography, useThemeColor } from 'heroui-native';
import { View } from 'react-native';

/** Opens the flat's rooms and who lives in each (FR-10.6). */
export function RoomsLink({ apartmentId }: { apartmentId: string }) {
  const iconColor = useThemeColor('muted');
  return (
    <PressableFeedback
      onPress={() =>
        router.push({ pathname: '/apartments/[apartmentId]/rooms', params: { apartmentId } })
      }
      accessibilityRole="button"
      accessibilityLabel="Rooms"
      accessibilityHint="Shows the rooms and who lives in each, used to split bills by room"
    >
      <Card>
        <Card.Body className="flex-row items-center gap-3">
          <Ionicons name="bed-outline" size={22} color={iconColor} />
          <View className="flex-1">
            <Typography.Paragraph>Rooms</Typography.Paragraph>
            <Typography.Paragraph type="body-xs" color="muted">
              Who lives where, for splitting bills by room
            </Typography.Paragraph>
          </View>
          <Ionicons name="chevron-forward" size={20} color={iconColor} />
        </Card.Body>
      </Card>
    </PressableFeedback>
  );
}
