import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import * as Network from "expo-network";
import * as Speech from "expo-speech";
import { markPresenceVoiceFinished, markPresenceVoiceStarted } from "./presenceRuntime";
import { requestWithFailover } from "./api";

type PersonalityId = "sylana" | "claude";

export interface PresenceSpeakOptions {
  personality?: PersonalityId;
  priority?: "normal" | "high";
  interrupt?: boolean;
  cache?: boolean;
}

export interface PresenceVoiceState {
  isSpeaking: boolean;
  currentText: string | null;
  source: "cache" | "cloud" | "offline" | null;
}

interface SpeechResponse {
  audio_url: string;
}

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ""}presence-voice/`;
const player = createAudioPlayer();
let completionResolver: (() => void) | null = null;
let speechFallbackActive = false;

player.addListener("playbackStatusUpdate", (status) => {
  if (status.didJustFinish || (!status.playing && status.duration > 0 && status.currentTime >= status.duration)) {
    const resolve = completionResolver;
    completionResolver = null;
    markPresenceVoiceFinished();
    resolve?.();
  }
});

async function ensureCacheDirectory() {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

async function configurePlaybackMode() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: "duckOthers",
    shouldPlayInBackground: false,
    allowsRecording: false,
  });
}

function normalizeText(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim();
}

async function hashVoiceKey(personality: PersonalityId, text: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${personality}::${text}`);
}

async function getCachedFileUri(personality: PersonalityId, text: string): Promise<string> {
  const digest = await hashVoiceKey(personality, text);
  return `${CACHE_DIR}${digest}.mp3`;
}

async function resolveSpeechUrl(text: string, personality: PersonalityId): Promise<string> {
  const { text: raw, baseUrl } = await requestWithFailover(
    "/api/voice/speak",
    {
      method: "POST",
      body: JSON.stringify({ text, personality }),
    },
    "json"
  );
  const parsed = (raw ? JSON.parse(raw) : {}) as SpeechResponse;
  const relative = String(parsed.audio_url || "").trim();
  if (!relative) {
    throw new Error("Voice endpoint returned no audio URL");
  }
  return new URL(relative, `${baseUrl}/`).toString();
}

async function playFile(uri: string, text: string, source: "cache" | "cloud") {
  await configurePlaybackMode();
  completionResolver = null;
  player.replace(uri);
  markPresenceVoiceStarted(text, source);
  player.play();
  await new Promise<void>((resolve) => {
    completionResolver = resolve;
  });
}

async function speakOffline(text: string) {
  speechFallbackActive = true;
  markPresenceVoiceStarted(text, "offline");
  await new Promise<void>((resolve) => {
    Speech.speak(text, {
      onDone: () => {
        speechFallbackActive = false;
        markPresenceVoiceFinished();
        resolve();
      },
      onStopped: () => {
        speechFallbackActive = false;
        markPresenceVoiceFinished();
        resolve();
      },
      onError: () => {
        speechFallbackActive = false;
        markPresenceVoiceFinished();
        resolve();
      },
    });
  });
}

export async function speak(text: string, options: PresenceSpeakOptions = {}): Promise<void> {
  const normalized = normalizeText(text);
  if (!normalized) {
    return;
  }

  const personality = options.personality ?? "sylana";
  if (options.interrupt !== false) {
    await stopSpeaking();
  }

  await ensureCacheDirectory();
  const cacheUri = await getCachedFileUri(personality, normalized);
  const cacheEnabled = options.cache !== false;
  if (cacheEnabled) {
    const cacheInfo = await FileSystem.getInfoAsync(cacheUri);
    if (cacheInfo.exists) {
      await playFile(cacheUri, normalized, "cache");
      return;
    }
  }

  try {
    const network = await Network.getNetworkStateAsync();
    if (!network.isConnected) {
      throw new Error("offline");
    }

    const url = await resolveSpeechUrl(normalized, personality);
    if (cacheEnabled) {
      await FileSystem.downloadAsync(url, cacheUri);
      await playFile(cacheUri, normalized, "cloud");
      return;
    }
    await playFile(url, normalized, "cloud");
  } catch {
    await speakOffline(normalized);
  }
}

export async function stopSpeaking(): Promise<void> {
  completionResolver = null;
  try {
    player.pause();
  } catch {
    // Ignore player pause failures.
  }
  if (speechFallbackActive) {
    Speech.stop();
    speechFallbackActive = false;
  }
  markPresenceVoiceFinished();
}

export async function preloadCommonPhrases(
  phrases: Array<{ text: string; personality?: PersonalityId }>
): Promise<void> {
  await ensureCacheDirectory();
  const network = await Network.getNetworkStateAsync();
  if (!network.isConnected) {
    return;
  }

  for (const phrase of phrases) {
    const text = normalizeText(phrase.text);
    if (!text) {
      continue;
    }
    const personality = phrase.personality ?? "sylana";
    const cacheUri = await getCachedFileUri(personality, text);
    const info = await FileSystem.getInfoAsync(cacheUri);
    if (info.exists) {
      continue;
    }
    try {
      const url = await resolveSpeechUrl(text, personality);
      await FileSystem.downloadAsync(url, cacheUri);
    } catch {
      // Ignore preload misses and continue.
    }
  }
}

export async function clearVoiceCache(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
  }
}
