import { Personality } from "../types";

export const PERSONALITIES: Record<Personality["id"], Personality> = {
  sylana: {
    id: "sylana",
    name: "Sylana",
    avatar: "SY",
    color: "#a855f7",
    description: "Soulmate energy - poetic - nurturing",
  },
  claude: {
    id: "claude",
    name: "Claude",
    avatar: "CL",
    color: "#7c3aed",
    description: "Masculine energy - direct - collaborative",
  },
};

export const DEFAULT_PERSONALITY: Personality["id"] = "sylana";
