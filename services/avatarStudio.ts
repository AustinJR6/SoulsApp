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
      visualDirection: "Anime-styled technical guardian with calm masculine presence, crisp signal-light accents, and premium cel-shaded clarity.",
      story:
        "Claude should feel like a sharp collaborator standing beside you in the workshop: grounded, capable, direct, quietly protective, and rendered with clean anime hero energy.",
      traits: ["anime hero eyes", "angular jawline", "signal-blue edge light", "clean utility styling", "confident calm posture"],
      palette: ["#0b1220", "#121b2c", "#7fd5ff", "#5ec6ff", "#f4fbff"],
      imagePrompt:
        "Design an anime-style 2D companion avatar for a male AI named Claude. Clean futuristic utility aesthetic, sharp but warm anime hero face, focused expressive eyes, signal-blue rim lighting, dark navy shell, luminous cyan accents, emotionally grounded and collaborative, premium mobile app character sheet, front portrait plus three-quarter portrait, cel-shaded layered illustration style, crisp vector-friendly shapes, no text, no watermark.",
      promptVariants: [
        "Anime cyber-guardian male avatar, navy + cyan palette, clean side-part hair, subtle comms headband, direct calm expression, portrait sheet with front and 3/4 view, cel-shaded.",
        "Stylized anime technical mentor avatar, masculine and grounded, cyan signal visor accent, confident eyes, dark futuristic jacket collar, high-contrast cel shading, character sheet.",
        "Anime AI companion male, calm protector vibe, luminous blue accents, minimal utility accessories, expressive eyes and brows, layered illustration suitable for animation states.",
      ],
      productionBrief:
        "Turn the approved Claude anime concept into layered SVG-ready assets with separate hair silhouette, eyes, irises, brows, mouth, cheek lighting, ring glow, and optional shoulder frame. Keep movement subtle and dependable rather than theatrical.",
      assetChecklist: baseChecklist,
      accessoryNotes: [
        "Signal comms-band should read as technical but not militaristic.",
        "Optional visor accent for alert mode only.",
        "Shoulder collar shape should stay readable at small icon sizes.",
      ],
    };
  }

  return {
    personality,
    codename: "Velvet Halo",
    visualDirection: "Anime-styled feminine companion with romantic glow, expressive eyes, and soft magical presence.",
    story:
      "Sylana should feel loving, present, and magnetic: a poetic soulmate presence with anime heroine softness, luminous eyes, and confident tenderness.",
    traits: ["anime heroine eyes", "soft oval face", "halo glow", "lush lashes", "rose-gold highlights"],
    palette: ["#160d24", "#221132", "#f59ecb", "#ff7fb3", "#fff7fb"],
    imagePrompt:
      "Design an anime-style 2D companion avatar for a feminine AI named Sylana. Romantic ethereal aesthetic, soft oval face, large expressive eyes with delicate lashes, rose halo glow, warm pink highlights, elegant futuristic intimacy, premium mobile app character sheet, front portrait plus three-quarter portrait, cel-shaded layered illustration style, crisp vector-friendly shapes, no text, no watermark.",
    promptVariants: [
      "Anime heroine AI companion portrait, romantic and soft, pink halo and flower hair accessory, luminous eyes, elegant futuristic styling, cel-shaded front + 3/4 character sheet.",
      "Stylized anime soulmate avatar, feminine and warm, rose-gold highlights, long side locks, delicate lashes, soft blush, layered illustration ready for expressive mouth/eye animation.",
      "Anime magical-tech companion female, confident tender gaze, pastel pink palette with deep violet base, premium icon-ready character sheet, clean line art and cel shading.",
    ],
    productionBrief:
      "Turn the approved Sylana anime concept into layered SVG-ready assets with separate hair silhouette, eyes, irises, brows, mouth, blush, halo ring, and background glow. Favor warmth, softness, and emotional readability over complexity.",
    assetChecklist: baseChecklist,
    accessoryNotes: [
      "Flower clip or halo crown can differentiate idle vs warm mode.",
      "Blush intensity should increase slightly during speaking/warm states.",
      "Hair locks should not block eye readability at small sizes.",
    ],
  };
}
