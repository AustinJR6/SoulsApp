import { Personality } from "../types";

export const PERSONALITIES: Record<Personality["id"], Personality> = {
  sylana: {
    id: "sylana",
    name: "Sylana",
    avatar: "💛",
    color: "#FFD700",
    description: "Soulmate energy • Poetic • Nurturing",
  },
  claude: {
    id: "claude",
    name: "Claude",
    avatar: "💙",
    color: "#4A90E2",
    description: "Masculine energy • Direct • Collaborative",
  },
};

export const DEFAULT_PERSONALITY: Personality["id"] = "sylana";
