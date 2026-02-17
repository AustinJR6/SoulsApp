import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { PERSONALITIES, DEFAULT_PERSONALITY } from "../constants/personalities";
import { Personality } from "../types";
import { storage } from "../services/storage";

interface PersonalityContextType {
  currentPersonality: Personality["id"];
  setPersonality: (id: Personality["id"]) => Promise<void>;
  personalityConfig: Personality;
}

const PersonalityContext = createContext<PersonalityContextType | undefined>(undefined);

export const PersonalityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPersonality, setCurrentPersonality] =
    useState<Personality["id"]>(DEFAULT_PERSONALITY);

  useEffect(() => {
    const loadPersonality = async () => {
      const saved = await storage.getCurrentPersonality();
      if (saved === "sylana" || saved === "claude") {
        setCurrentPersonality(saved);
      }
    };
    loadPersonality();
  }, []);

  const setPersonality = async (id: Personality["id"]) => {
    await storage.setCurrentPersonality(id);
    setCurrentPersonality(id);
  };

  const personalityConfig = PERSONALITIES[currentPersonality];

  const value = useMemo(
    () => ({
      currentPersonality,
      setPersonality,
      personalityConfig,
    }),
    [currentPersonality, personalityConfig]
  );

  return <PersonalityContext.Provider value={value}>{children}</PersonalityContext.Provider>;
};

export const usePersonality = () => {
  const context = useContext(PersonalityContext);
  if (!context) {
    throw new Error("usePersonality must be used within PersonalityProvider");
  }
  return context;
};
