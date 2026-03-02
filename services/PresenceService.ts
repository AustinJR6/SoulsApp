import { PresenceLog } from "../types/presence";
import { requestJsonWithFailover } from "./api";

export const presenceService = {
  listLogs: async (limit = 20): Promise<PresenceLog[]> => {
    const response = await requestJsonWithFailover<{ logs?: PresenceLog[] }>(`/presence/logs?limit=${limit}`, {
      method: "GET",
    });
    return Array.isArray(response.logs) ? response.logs : [];
  },

  runNightlyNow: async (): Promise<void> => {
    await requestJsonWithFailover("/presence/nightly/run-now", { method: "POST" });
  },
};
