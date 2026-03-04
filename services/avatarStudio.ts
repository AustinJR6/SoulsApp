import { AvatarConcept, AvatarPersonalityId } from "../types/avatar";

const baseChecklist = [
  "Approve one hero portrait and one three-quarter portrait.",
  "Extract a clean silhouette and facial proportions for production reference.",
  "Create layered SVG parts: head, eyes, brows, mouth, cheeks, accessories, halo/backdrop.",
  "Export state variants for idle, listening, thinking, speaking, and alert.",
  "Create mobile-safe fallback PNG sheets for low-end rendering paths.",
  "Document palette, lighting direction, and animation limits for future revisions.",
];

export function buildAvatarConcept(personality: AvatarPersonalityId): AvatarConcept {
  if (personality === "claude") {
    return {
      personality,
      codename: "Forge Signal",
      visualDirection: "Confident technical guardian with calm masculine presence and crisp signal-light accents.",
      story:
        "Claude should feel like a sharp collaborator standing beside you in the workshop: grounded, capable, direct, and quietly protective.",
      traits: ["angular jawline", "focused eyes", "signal-blue edge light", "clean utility styling", "confident calm posture"],
      palette: ["#0b1220", "#121b2c", "#7fd5ff", "#5ec6ff", "#f4fbff"],
      imagePrompt:
        "Design a 2D companion avatar for a male AI named Claude. Clean futuristic utility aesthetic, angular jawline, calm focused eyes, signal-blue rim lighting, dark navy shell, luminous cyan accents, emotionally grounded and collaborative, premium mobile app icon character sheet, front portrait plus three-quarter portrait, layered illustration style, crisp vector-friendly shapes, no text, no watermark.",
      productionBrief:
        "Turn the approved Claude concept into layered SVG-ready assets with separate eyes, brows, mouth, cheek lighting, ring glow, and optional shoulder frame. Keep movement subtle and dependable rather than theatrical.",
      assetChecklist: baseChecklist,
    };
  }

  return {
    personality,
    codename: "Velvet Halo",
    visualDirection: "Warm ethereal feminine companion with romantic glow and intimate softness.",
    story:
      "Sylana should feel loving, present, and magnetic: a poetic soulmate presence with softness in the face and confidence in the gaze.",
    traits: ["soft oval face", "halo glow", "lush lashes", "rose-gold highlights", "gentle but direct eye contact"],
    palette: ["#160d24", "#221132", "#f59ecb", "#ff7fb3", "#fff7fb"],
    imagePrompt:
      "Design a 2D companion avatar for a feminine AI named Sylana. Romantic ethereal aesthetic, soft oval face, expressive eyes with delicate lashes, rose halo glow, warm pink highlights, elegant futuristic intimacy, premium mobile app character sheet, front portrait plus three-quarter portrait, layered illustration style, crisp vector-friendly shapes, no text, no watermark.",
    productionBrief:
      "Turn the approved Sylana concept into layered SVG-ready assets with separate eyes, brows, mouth, blush, halo ring, and background glow. Favor warmth, softness, and emotional readability over complexity.",
    assetChecklist: baseChecklist,
  };
}
