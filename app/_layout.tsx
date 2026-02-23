import 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { theme } from '../constants/theme';
import { PersonalityProvider } from '../contexts/PersonalityContext';
import { healthService } from '../services/HealthService';
import { supabase } from '../services/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Warm up Health Connect SDK on app launch (silent, no permission prompt).
function useHealthConnectInit() {
  useEffect(() => {
    healthService.initialize().catch(() => {
      // HC unavailable on this device, ignore and let Vitals screen handle it.
    });
  }, []);
}

// Ensures there is always an authenticated Supabase session.
function useEnsureAuth() {
  useEffect(() => {
    const ensureSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        await supabase.auth.signInAnonymously();
      }
    };

    ensureSession().catch(() => {
      // Auth failure is non-fatal; features relying on Supabase will retry later.
    });
  }, []);
}

function isDraftAlertResponse(response: Notifications.NotificationResponse): boolean {
  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const title = (response.notification.request.content.title ?? '').toLowerCase();
  const body = (response.notification.request.content.body ?? '').toLowerCase();
  const type = typeof data?.type === 'string' ? data.type.toLowerCase() : '';
  const screen = typeof data?.screen === 'string' ? data.screen.toLowerCase() : '';
  const route = typeof data?.route === 'string' ? data.route.toLowerCase() : '';
  const target = typeof data?.target === 'string' ? data.target.toLowerCase() : '';

  return (
    title.includes('draft') ||
    body.includes('draft') ||
    type.includes('draft') ||
    screen.includes('outreach_queue') ||
    route.includes('outreach/queue') ||
    target.includes('draft_queue')
  );
}

function useOutreachNotificationRouting() {
  const router = useRouter();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (isDraftAlertResponse(response)) {
        router.push('/(tabs)/outreach/queue');
      }
    });

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response && isDraftAlertResponse(response)) {
          router.push('/(tabs)/outreach/queue');
        }
      })
      .catch(() => {
        // Ignore startup response read failures.
      });

    return () => {
      subscription.remove();
    };
  }, [router]);
}

export default function RootLayout() {
  useHealthConnectInit();
  useEnsureAuth();
  useOutreachNotificationRouting();

  return (
    <PersonalityProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </PersonalityProvider>
  );
}
