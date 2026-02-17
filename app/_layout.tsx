import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { PersonalityProvider } from "../contexts/PersonalityContext";

export default function RootLayout() {
  return (
    <PersonalityProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </PersonalityProvider>
  );
}
