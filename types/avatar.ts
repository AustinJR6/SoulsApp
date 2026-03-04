export type AvatarPersonalityId = "sylana" | "claude";

export type LiveVoiceMode = "hands_free" | "push_to_talk";

export type AvatarMood = "neutral" | "warm" | "alert";

export type AvatarExpression = "idle" | "listening" | "thinking" | "speaking" | "alert";

export interface AvatarConcept {
  personality: AvatarPersonalityId;
  codename: string;
  visualDirection: string;
  story: string;
  traits: string[];
  palette: string[];
  imagePrompt: string;
  productionBrief: string;
  assetChecklist: string[];
}
