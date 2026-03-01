import { Platform } from "react-native";
import { setAudioModeAsync } from "expo-audio";
import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
} from "react-native-webrtc";
import type RTCDataChannel from "react-native-webrtc/lib/typescript/RTCDataChannel";
import { requestJsonWithFailover } from "./api";

type PersonalityId = "sylana" | "claude";
type CallState = "idle" | "connecting" | "connected" | "disconnected" | "failed";

export interface RealtimeTranscriptEntry {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  final: boolean;
}

interface RealtimeCallResponse {
  sdp: string;
  call_id?: string;
  voice?: string;
  personality?: string;
  model?: string;
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

  constructor(callbacks: RealtimeVoiceCallbacks = {}) {
    this.callbacks = callbacks;
  }

  async connect(personality: PersonalityId) {
    if (Platform.OS === "web") {
      throw new Error("Realtime voice is only configured for native builds.");
    }

    this.callbacks.onStateChange?.("connecting", "Opening microphone and peer connection");
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "duckOthers",
    });

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
      this.callbacks.onStateChange?.("connected", "Listening");
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
    this.localStream.getTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, this.localStream!);
    });

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
    });
    await this.peerConnection.setLocalDescription(offer);
    await this.waitForIceGathering();

    const answer = await requestJsonWithFailover<RealtimeCallResponse>("/api/voice/realtime/call", {
      method: "POST",
      body: JSON.stringify({
        sdp: this.peerConnection.localDescription?.sdp,
        personality,
      }),
    });
    if (!answer.sdp) {
      throw new Error("Realtime backend did not return an SDP answer");
    }
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription({
        type: "answer",
        sdp: answer.sdp,
      })
    );
    this.callbacks.onStateChange?.("connected", `Connected to ${answer.personality || personality}`);
  }

  setMuted(muted: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  disconnect() {
    this.dataChannel?.close();
    this.dataChannel = null;
    this.peerConnection?.getSenders().forEach((sender) => sender.track?.stop());
    this.peerConnection?.close();
    this.peerConnection = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.transcriptCache.clear();
    setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "duckOthers",
    }).catch(() => {});
    this.callbacks.onStateChange?.("disconnected", "Live voice ended");
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
