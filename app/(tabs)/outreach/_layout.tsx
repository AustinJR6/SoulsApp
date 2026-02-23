import { Stack } from 'expo-router';
import { theme } from '../../../constants/theme';

export default function OutreachLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="queue" />
      <Stack.Screen name="draft/[id]" />
      <Stack.Screen name="prospects" />
      <Stack.Screen name="prospect/[id]" />
      <Stack.Screen name="session/[id]" />
    </Stack>
  );
}
