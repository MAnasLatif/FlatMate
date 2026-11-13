import Stack from 'expo-router/stack';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="apartments/new" options={{ title: 'New apartment' }} />
      <Stack.Screen name="apartments/[apartmentId]" options={{ headerShown: false }} />
    </Stack>
  );
}
