import { NativeModules, Platform } from "react-native";

interface WearPresencePayload {
  type: string;
  severity: string;
  timestamp: string;
  summary?: string;
}

type WearPresenceNativeModule = {
  sendPresenceEvent: (payloadJson: string) => Promise<void>;
  getConnectionStatus: () => Promise<{ connected: boolean; nodes: number }>;
};

const moduleRef = (NativeModules.WearPresenceModule ?? null) as WearPresenceNativeModule | null;

export async function sendPresenceEventToWear(payload: WearPresencePayload): Promise<void> {
  if (Platform.OS !== "android" || !moduleRef?.sendPresenceEvent) {
    return;
  }
  await moduleRef.sendPresenceEvent(JSON.stringify(payload));
}

export async function getWearConnectionStatus(): Promise<{ connected: boolean; nodes: number }> {
  if (Platform.OS !== "android" || !moduleRef?.getConnectionStatus) {
    return { connected: false, nodes: 0 };
  }
  return moduleRef.getConnectionStatus();
}
