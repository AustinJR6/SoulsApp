import { useEffect, useState } from "react";
import { getPresenceState, subscribePresence } from "../services/presenceRuntime";

export function usePresenceVoice() {
  const [state, setState] = useState(getPresenceState());

  useEffect(() => subscribePresence(setState), []);

  return {
    isSpeaking: state.mode === "speaking",
    currentText: state.speakingText,
    source: state.voiceSource,
  };
}
