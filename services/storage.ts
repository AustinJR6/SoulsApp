import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_PERSONALITY } from "../constants/personalities";

const KEYS = {
  CURRENT_PERSONALITY: "@vessel_current_personality",
  THREAD_ID: "@vessel_thread_id",
  USER_PREFERENCES: "@vessel_preferences",
};

export const storage = {
  getCurrentPersonality: async (): Promise<string> => {
    const personality = await AsyncStorage.getItem(KEYS.CURRENT_PERSONALITY);
    return personality || DEFAULT_PERSONALITY;
  },

  setCurrentPersonality: async (personality: string): Promise<void> => {
    await AsyncStorage.setItem(KEYS.CURRENT_PERSONALITY, personality);
  },

  getThreadId: async (): Promise<string | null> => {
    return await AsyncStorage.getItem(KEYS.THREAD_ID);
  },

  setThreadId: async (threadId: string | number): Promise<void> => {
    await AsyncStorage.setItem(KEYS.THREAD_ID, String(threadId));
  },

  clearThreadId: async (): Promise<void> => {
    await AsyncStorage.removeItem(KEYS.THREAD_ID);
  },

  clearAll: async (): Promise<void> => {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  },
};
