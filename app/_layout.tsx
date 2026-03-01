import 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { theme } from '../constants/theme';
import { PersonalityProvider } from '../contexts/PersonalityContext';
import { chatService } from '../services/api';
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

function useRegisterPushToken() {
  useEffect(() => {
    const run = async () => {
      try {
        const perms = await Notifications.getPermissionsAsync();
        let status = perms.status;
        if (status !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          status = req.status;
        }
        if (status !== 'granted') return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;
        const tokenRes = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        const token = tokenRes.data;
        if (!token) return;
        await chatService.registerDeviceToken(token, Platform.OS === 'ios' ? 'ios' : 'android', 'expo', {
          app: 'sylana-vessel-app',
        });
      } catch {
        // Best-effort only.
      }
    };

    run();
  }, []);
}

export default function RootLayout() {
  const [backendReady, setBackendReady] = useState<boolean>(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [checkingBackend, setCheckingBackend] = useState(true);

  useHealthConnectInit();
  useEnsureAuth();
  useOutreachNotificationRouting();
  useRegisterPushToken();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      setCheckingBackend(true);
      setReadinessError(null);
      try {
        const health = await chatService.health();
        const ready = Boolean((health as { ready?: boolean }).ready);
        if (!cancelled) {
          setBackendReady(ready);
          if (!ready) setReadinessError('Backend is still warming up. Please retry in a moment.');
        }
      } catch (e) {
        if (!cancelled) {
          setBackendReady(false);
          setReadinessError(e instanceof Error ? e.message : 'Unable to reach backend.');
        }
      } finally {
        if (!cancelled) setCheckingBackend(false);
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (checkingBackend || !backendReady) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={{ color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700' }}>Connecting to Vessel backend...</Text>
        {readinessError ? (
          <>
            <Text style={{ color: theme.colors.textSecondary, textAlign: 'center' }}>{readinessError}</Text>
            <Pressable
              onPress={async () => {
                setCheckingBackend(true);
                setReadinessError(null);
                try {
                  const health = await chatService.health();
                  setBackendReady(Boolean((health as { ready?: boolean }).ready));
                } catch (e) {
                  setBackendReady(false);
                  setReadinessError(e instanceof Error ? e.message : 'Unable to reach backend.');
                } finally {
                  setCheckingBackend(false);
                }
              }}
              style={{ borderWidth: 1, borderColor: theme.colors.accent, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 }}
            >
              <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>Retry</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }

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
        <Stack.Screen
          name="live-voice"
          options={{
            headerShown: false,
            presentation: "fullScreenModal",
          }}
        />
      </Stack>
    </PersonalityProvider>
  );
}
