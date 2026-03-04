import { AvatarPersonalityId } from "../types/avatar";

export interface AvatarProfile {
  ring: string;
  glow: string;
  shell: string;
  face: string;
  eye: string;
  pupil: string;
  brow: string;
  mouth: string;
  accent: string;
  cheek: string;
  eyeTilt: number;
  eyeRadiusY: number;
  browArch: number;
  jawWidth: number;
  mouthWidth: number;
  lashes: boolean;
  chinNotch: boolean;
}

export const AVATAR_PROFILES: Record<AvatarPersonalityId, AvatarProfile> = {
  sylana: {
    ring: "#f59ecb",
    glow: "rgba(245, 158, 203, 0.32)",
    shell: "#221132",
    face: "#160d24",
    eye: "#fff7fb",
    pupil: "#140714",
    brow: "#f9b4d8",
    mouth: "#ff7fb3",
    accent: "#ffc9df",
    cheek: "rgba(255, 182, 193, 0.22)",
    eyeTilt: -3,
    eyeRadiusY: 9,
    browArch: 11,
    jawWidth: 60,
    mouthWidth: 16,
    lashes: true,
    chinNotch: false,
  },
  claude: {
    ring: "#7fd5ff",
    glow: "rgba(127, 213, 255, 0.24)",
    shell: "#121b2c",
    face: "#0b1220",
    eye: "#f4fbff",
    pupil: "#07111b",
    brow: "#9dd7ff",
    mouth: "#6fd8ff",
    accent: "#5ec6ff",
    cheek: "rgba(94, 198, 255, 0.14)",
    eyeTilt: 2,
    eyeRadiusY: 7,
    browArch: 7,
    jawWidth: 66,
    mouthWidth: 20,
    lashes: false,
    chinNotch: true,
  },
};
