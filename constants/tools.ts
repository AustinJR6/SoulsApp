import { ToolDescriptor } from "../types";

export const DEFAULT_TOOL_IDS = ["memories", "web_search"] as const;

export const TOOL_PRESETS: Array<{ id: "chat" | "build" | "work"; label: string; tools: string[] }> = [
  { id: "chat", label: "Chat", tools: ["memories", "web_search"] },
  { id: "build", label: "Build", tools: ["code", "files", "github", "memories"] },
  { id: "work", label: "Work", tools: ["workflows", "outreach", "web_search", "memories"] },
];

export const TOOL_CATALOG: ToolDescriptor[] = [
  { id: "web_search", label: "Web Search" },
  { id: "code", label: "Code" },
  { id: "files", label: "Files" },
  { id: "health", label: "Health" },
  { id: "workflows", label: "Workflows" },
  { id: "github", label: "GitHub" },
  { id: "photos", label: "Photos" },
  { id: "memories", label: "Memories" },
  { id: "outreach", label: "Outreach" },
];

const TOOL_ALIASES: Record<string, string> = {
  web: "web_search",
  websearch: "web_search",
  web_search: "web_search",
  code: "code",
  terminal: "code",
  files: "files",
  folder_open: "files",
  folderopen: "files",
  health: "health",
  vitals: "health",
  workflows: "workflows",
  workflow: "workflows",
  github: "github",
  git_hub: "github",
  photos: "photos",
  photo: "photos",
  image: "photos",
  memories: "memories",
  memory: "memories",
  outreach: "outreach",
};

export function normalizeToolId(id: string): string {
  const normalized = id.trim().toLowerCase().replace(/[\s\-]+/g, "_");
  return TOOL_ALIASES[normalized] ?? normalized;
}

export function mergeAvailableTools(apiTools: Array<{ id: string; label?: string }>): ToolDescriptor[] {
  const map = new Map<string, ToolDescriptor>();

  TOOL_CATALOG.forEach((tool) => map.set(tool.id, tool));

  apiTools.forEach((tool) => {
    const normalizedId = normalizeToolId(tool.id);
    if (!normalizedId) return;

    if (map.has(normalizedId)) {
      if (tool.label?.trim()) {
        map.set(normalizedId, { id: normalizedId, label: tool.label.trim() });
      }
      return;
    }

    map.set(normalizedId, {
      id: normalizedId,
      label: tool.label?.trim() || normalizedId.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
    });
  });

  return Array.from(map.values());
}

export function sanitizeTools(tools: string[]): string[] {
  const seen = new Set<string>();
  const safe: string[] = [];

  tools.forEach((tool) => {
    const normalized = normalizeToolId(tool);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    safe.push(normalized);
  });

  return safe;
}
