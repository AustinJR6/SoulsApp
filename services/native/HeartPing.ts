import { NativeModules, Platform } from "react-native";

type HeartPingNativeModule = {
  ping: (pattern?: number[]) => Promise<void>;
};

const moduleRef = (NativeModules.HeartPingModule ?? null) as HeartPingNativeModule | null;

export async function ping(pattern: number[] = [0, 30, 200, 15]): Promise<void> {
  if (Platform.OS !== "android" || !moduleRef?.ping) {
    return;
  }
  await moduleRef.ping(pattern);
}
