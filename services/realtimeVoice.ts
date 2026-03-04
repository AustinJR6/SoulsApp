import { Platform } from "react-native";
import { setAudioModeAsync } from "expo-audio";
import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
} from "react-native-webrtc";
import type RTCDataChannel from "react-native-webrtc/lib/typescript/RTCDataChannel";
import { createRealtimeVoiceSession } from "./voice";
import { LiveVoiceMode } from "../types/avatar";

type PersonalityId = "sylana" | "claude";
type CallState = "idle" | "connecting" | "connected" | "disconnected" | "failed";

export interface RealtimeTranscriptEntry {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  final: boolean;
}

interface RealtimeVoiceCallbacks {
  onStateChange?: (state: CallState, detail?: string) => void;
  onTranscript?: (entry: RealtimeTranscriptEntry) => void;
  onEvent?: (event: Record<string, unknown>) => void;
}

const RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export class RealtimeVoiceClient {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private callbacks: RealtimeVoiceCallbacks;
  private transcriptCache = new Map<string, RealtimeTranscriptEntry>();
  private mode: LiveVoiceMode = "hands_free";
  private requestedVoice: string | null = null;
  private dataChannelOpen = false;
  private pendingSessionConfig = false;
  private pushToTalkActive = false;
  private terminated = false;
  private connectNonce = 0;

  constructor(callbacks: RealtimeVoiceCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async connect(personality: PersonalityId, mode: LiveVoiceMode = "hands_free") {
    if (Platform.OS === "web") {
      throw new Error("Realtime voice is only configured for native builds.");
    }
    this.mode = mode;
    this.terminated = false;
    const nonce = ++this.connectNonce;

    this.callbacks.onStateChange?.("connecting", "Opening microphone and peer connection");
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "duckOthers",
    });
    this.ensureConnectionActive(nonce);

    this.peerConnection = new RTCPeerConnection(RTC_CONFIG);
    this.bindListener(this.peerConnection, "connectionstatechange", () => {
      const state = this.peerConnection?.connectionState ?? "disconnected";
      if (state === "connected") {
        this.callbacks.onStateChange?.("connected", "Live voice is active");
      } else if (state === "failed") {
        this.callbacks.onStateChange?.("failed", "Peer connection failed");
      } else if (state === "disconnected" || state === "closed") {
        this.callbacks.onStateChange?.("disconnected", "Live voice ended");
      } else {
        this.callbacks.onStateChange?.("connecting", state);
      }
    });
    this.bindListener(this.peerConnection, "iceconnectionstatechange", () => {
      const state = this.peerConnection?.iceConnectionState ?? "";
      if (state === "failed") {
        this.callbacks.onStateChange?.("failed", "ICE negotiation failed");
      }
    });

    this.dataChannel = this.peerConnection.createDataChannel("oai-events") as RTCDataChannel;
    this.bindListener(this.dataChannel, "open", () => {
      this.dataChannelOpen = true;
      this.flushSessionConfig();
      this.callbacks.onStateChange?.("connected", this.mode === "push_to_talk" ? "Push to talk ready" : "Listening");
    });
    this.bindListener(this.dataChannel, "message", (event: { data?: unknown }) => {
      try {
        const parsed = JSON.parse(String(event.data || "{}")) as Record<string, unknown>;
        this.callbacks.onEvent?.(parsed);
        this.handleRealtimeEvent(parsed);
      } catch {
        // Ignore malformed event payloads.
      }
    });

    this.localStream = (await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    })) as MediaStream;
    this.ensureConnectionActive(nonce);
    this.localStream.getTracks().forEach((track) => {
      track.enabled = mode !== "push_to_talk";
      this.peerConnection?.addTrack(track, this.localStream!);
    });

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
    });
    this.ensureConnectionActive(nonce);
    await this.peerConnection.setLocalDescription(offer);
    this.ensureConnectionActive(nonce);
    await this.waitForIceGathering();
    this.ensureConnectionActive(nonce);

    const session = await createRealtimeVoiceSession(personality, mode);
    this.ensureConnectionActive(nonce);
    const clientSecret = String(session.client_secret?.value || "").trim();
    if (!clientSecret) {
      throw new Error("Realtime backend did not return a client secret");
    }
    this.requestedVoice = typeof session.requested_voice === "string" ? session.requested_voice : null;

    const answerResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        Accept: "application/sdp",
        "Content-Type": "application/sdp",
      },
      body: this.peerConnection.localDescription?.sdp || "",
    });
    this.ensureConnectionActive(nonce);
    const answerSdp = await answerResponse.text();
    if (!answerResponse.ok || !answerSdp.trim()) {
      throw new Error(answerSdp || "Realtime call creation failed");
    }
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription({
        type: "answer",
        sdp: answerSdp,
      })
    );
    this.ensureConnectionActive(nonce);
    this.pendingSessionConfig = true;
    this.flushSessionConfig();
    this.callbacks.onStateChange?.("connected", `Connected to ${session.personality || personality}`);
  }

  setMuted(muted: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  setMode(mode: LiveVoiceMode) {
    this.mode = mode;
    this.pendingSessionConfig = true;
    if (mode === "push_to_talk") {
      this.pushToTalkActive = false;
      this.setMuted(true);
    } else {
      this.setMuted(false);
    }
    this.flushSessionConfig();
  }

  beginPushToTalk() {
    if (this.mode !== "push_to_talk") {
      return;
    }
    this.pushToTalkActive = true;
    this.sendEvent({ type: "response.cancel" });
    this.sendEvent({ type: "input_audio_buffer.clear" });
    this.setMuted(false);
    this.callbacks.onStateChange?.("connected", "Listening...");
  }

  endPushToTalk() {
    if (this.mode !== "push_to_talk" || !this.pushToTalkActive) {
      return;
    }
    this.pushToTalkActive = false;
    this.setMuted(true);
    this.sendEvent({ type: "input_audio_buffer.commit" });
    this.sendEvent({ type: "response.create" });
    this.callbacks.onStateChange?.("connected", "Thinking...");
  }

  disconnect() {
    this.terminated = true;
    this.connectNonce += 1;
    this.sendEvent({ type: "response.cancel" });
    this.sendEvent({ type: "input_audio_buffer.clear" });
    this.dataChannel?.close();
    this.dataChannel = null;
    this.dataChannelOpen = false;
    this.peerConnection?.getSenders().forEach((sender) => sender.track?.stop());
    this.peerConnection?.getReceivers().forEach((receiver) => receiver.track?.stop());
    this.peerConnection?.close();
    this.peerConnection = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.transcriptCache.clear();
    this.pendingSessionConfig = false;
    this.pushToTalkActive = false;
    setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "duckOthers",
    }).catch(() => {});
    this.callbacks.onStateChange?.("disconnected", "Live voice ended");
  }

  private ensureConnectionActive(nonce: number) {
    if (this.terminated || nonce !== this.connectNonce) {
      throw new Error("Live voice session ended");
    }
  }

  private async waitForIceGathering() {
    const pc = this.peerConnection;
    if (!pc || pc.iceGatheringState === "complete") {
      return;
    }
    await new Promise<void>((resolve) => {
      const checkState = () => {
        if (pc.iceGatheringState === "complete") {
          this.unbindListener(pc, "icegatheringstatechange", checkState);
          resolve();
        }
      };
      this.bindListener(pc, "icegatheringstatechange", checkState);
      setTimeout(() => {
        this.unbindListener(pc, "icegatheringstatechange", checkState);
        resolve();
      }, 3000);
    });
  }

  private bindListener(target: unknown, eventName: string, handler: (...args: any[]) => void) {
    const eventTarget = target as {
      addEventListener?: (name: string, cb: (...args: any[]) => void) => void;
      onopen?: (...args: any[]) => void;
      onmessage?: (...args: any[]) => void;
    };
    if (typeof eventTarget.addEventListener === "function") {
      eventTarget.addEventListener(eventName, handler);
      return;
    }
    if (eventName === "open") {
      eventTarget.onopen = handler;
    } else if (eventName === "message") {
      eventTarget.onmessage = handler;
    }
  }

  private flushSessionConfig() {
    if (!this.pendingSessionConfig || !this.dataChannelOpen) {
      return;
    }
    this.sendEvent({
      type: "session.update",
      session: {
        audio: {
          input: {
            turn_detection:
              this.mode === "hands_free"
                ? {
                    type: "semantic_vad",
                    eagerness: "medium",
                    create_response: true,
                    interrupt_response: true,
                  }
                : null,
          },
          output: this.requestedVoice ? { voice: this.requestedVoice } : undefined,
        },
      },
    });
    this.pendingSessionConfig = false;
  }

  private sendEvent(payload: Record<string, unknown>) {
    if (!this.dataChannelOpen || !this.dataChannel) {
      return;
    }
    try {
      this.dataChannel.send(JSON.stringify(payload));
    } catch {
      // Ignore transient data channel send failures.
    }
  }

  private unbindListener(target: unknown, eventName: string, handler: (...args: any[]) => void) {
    const eventTarget = target as {
      removeEventListener?: (name: string, cb: (...args: any[]) => void) => void;
    };
    if (typeof eventTarget.removeEventListener === "function") {
      eventTarget.removeEventListener(eventName, handler);
    }
  }

  private pushTranscript(id: string, role: RealtimeTranscriptEntry["role"], text: string, final: boolean) {
    const next: RealtimeTranscriptEntry = { id, role, text, final };
    this.transcriptCache.set(id, next);
    this.callbacks.onTranscript?.(next);
  }

  private handleRealtimeEvent(event: Record<string, unknown>) {
    const type = String(event.type || "");
    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcript = String(event.transcript || "").trim();
      if (transcript) {
        this.pushTranscript(String(event.item_id || `user-${Date.now()}`), "user", transcript, true);
      }
      return;
    }
    if (type === "response.audio_transcript.delta" || type === "response.output_text.delta") {
      const key = String(event.item_id || event.response_id || "assistant-live");
      const prev = this.transcriptCache.get(key)?.text || "";
      const delta = String(event.delta || "");
      this.pushTranscript(key, "assistant", `${prev}${delta}`, false);
      return;
    }
    if (type === "response.audio_transcript.done" || type === "response.output_text.done") {
      const key = String(event.item_id || event.response_id || "assistant-live");
      const text = String(event.transcript || event.text || this.transcriptCache.get(key)?.text || "").trim();
      if (text) {
        this.pushTranscript(key, "assistant", text, true);
      }
      return;
    }
    if (type === "input_audio_buffer.speech_started") {
      this.callbacks.onStateChange?.("connected", "Listening...");
      return;
    }
    if (type === "input_audio_buffer.speech_stopped") {
      this.callbacks.onStateChange?.("connected", "Thinking...");
    }
  }
}
