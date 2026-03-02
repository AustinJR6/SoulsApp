import React, { createContext, useContext, useEffect, useState } from "react";
import {
  acknowledgePresenceAlert,
  getPresenceState,
  setPresenceMode,
  subscribePresence,
} from "../services/presenceRuntime";
import { PresenceState } from "../types/presence";

interface PresenceContextValue {
  state: PresenceState;
  acknowledgeAlert: () => void;
  setMode: (mode: PresenceState["mode"]) => void;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PresenceState>(getPresenceState());

  useEffect(() => subscribePresence(setState), []);

  return (
    <PresenceContext.Provider
      value={{
        state,
        acknowledgeAlert: acknowledgePresenceAlert,
        setMode: setPresenceMode,
      }}
    >
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  const context = useContext(PresenceContext);
  if (!context) {
    throw new Error("usePresence must be used within PresenceProvider");
  }
  return context;
}
