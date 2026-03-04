import { AvatarPersonalityId } from "../types/avatar";

export interface AvatarProfile {
  ring: string;
  glow: string;
  shell: string;
  face: string;
  hair: string;
  hairShadow: string;
  eye: string;
  iris: string;
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
  fringeHeight: number;
  fringeCurve: number;
  sideLocks: boolean;
  accessory: "flower_clip" | "halo_crown" | "comms_band" | "visor";
}

export const AVATAR_PROFILES: Record<AvatarPersonalityId, AvatarProfile> = {
  sylana: {
    ring: "#f59ecb",
    glow: "rgba(245, 158, 203, 0.32)",
    shell: "#221132",
    face: "#160d24",
    hair: "#f08fc9",
    hairShadow: "#a24b87",
    eye: "#fff7fb",
    iris: "#ff7dc2",
    pupil: "#140714",
    brow: "#f9b4d8",
    mouth: "#ff7fb3",
    accent: "#ffc9df",
    cheek: "rgba(255, 182, 193, 0.22)",
    eyeTilt: -3,
    eyeRadiusY: 11,
    browArch: 11,
    jawWidth: 56,
    mouthWidth: 14,
    lashes: true,
    chinNotch: false,
    fringeHeight: 22,
    fringeCurve: 10,
    sideLocks: true,
    accessory: "flower_clip",
  },
  claude: {
    ring: "#7fd5ff",
    glow: "rgba(127, 213, 255, 0.24)",
    shell: "#121b2c",
    face: "#0b1220",
    hair: "#79cfff",
    hairShadow: "#2d6b8c",
    eye: "#f4fbff",
    iris: "#6ec6ff",
    pupil: "#07111b",
    brow: "#9dd7ff",
    mouth: "#6fd8ff",
    accent: "#5ec6ff",
    cheek: "rgba(94, 198, 255, 0.14)",
    eyeTilt: 2,
    eyeRadiusY: 9,
    browArch: 8,
    jawWidth: 62,
    mouthWidth: 20,
    lashes: false,
    chinNotch: true,
    fringeHeight: 18,
    fringeCurve: 7,
    sideLocks: false,
    accessory: "comms_band",
  },
};
