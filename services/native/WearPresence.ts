import { NativeModules, Platform } from "react-native";

interface WearPresencePayload {
  type: string;
  severity: string;
  timestamp: string;
  summary?: string;
  route?: string;
}

export interface WearNodeDetails {
  id: string;
  displayName: string;
  nearby: boolean;
}

export interface WearConnectionStatus {
  connected: boolean;
  nodes: number;
  embeddedApp: boolean;
  nodeDetails: WearNodeDetails[];
}

type WearPresenceNativeModule = {
  sendPresenceEvent?: (payload: WearPresencePayload) => Promise<boolean>;
  sendEvent?: (payload: WearPresencePayload) => Promise<boolean>;
  getConnectionStatus?: () => Promise<WearConnectionStatus>;
  getStatus?: () => Promise<WearConnectionStatus>;
};

const moduleRef = (NativeModules.WearPresenceModule ?? null) as WearPresenceNativeModule | null;

export async function sendPresenceEventToWear(payload: WearPresencePayload): Promise<void> {
  if (Platform.OS !== "android" || !moduleRef) {
    return;
  }
  if (moduleRef.sendPresenceEvent) {
    await moduleRef.sendPresenceEvent(payload);
    return;
  }
  if (moduleRef.sendEvent) {
    await moduleRef.sendEvent(payload);
  }
}

export async function getWearConnectionStatus(): Promise<WearConnectionStatus> {
  if (Platform.OS !== "android" || !moduleRef) {
    return { connected: false, nodes: 0, embeddedApp: false, nodeDetails: [] };
  }
  if (moduleRef.getConnectionStatus) {
    return moduleRef.getConnectionStatus();
  }
  if (moduleRef.getStatus) {
    return moduleRef.getStatus();
  }
  return { connected: false, nodes: 0, embeddedApp: false, nodeDetails: [] };
}
