import { ToolDescriptor } from "../types";

export const DEFAULT_TOOL_IDS = ["memories", "web_search"] as const;

export const TOOL_PRESETS: Array<{ id: "chat" | "build" | "work"; label: string; tools: string[] }> = [
  { id: "chat", label: "Chat", tools: ["memories", "web_search"] },
  { id: "build", label: "Build", tools: ["code_execution", "files", "github", "memories"] },
  { id: "work", label: "Work", tools: ["work_sessions", "outreach", "web_search", "memories"] },
];

export const TOOL_CATALOG: ToolDescriptor[] = [
  { id: "web_search", label: "Web Search" },
  { id: "code_execution", label: "Code Execution" },
  { id: "files", label: "Files" },
  { id: "health_data", label: "Health Data" },
  { id: "work_sessions", label: "Work Sessions" },
  { id: "github", label: "GitHub" },
  { id: "photos", label: "Photos" },
  { id: "memories", label: "Memories" },
  { id: "outreach", label: "Outreach" },
];

const TOOL_ALIASES: Record<string, string> = {
  web: "web_search",
  websearch: "web_search",
  web_search: "web_search",
  code: "code_execution",
  code_execution: "code_execution",
  terminal: "code_execution",
  files: "files",
  folder_open: "files",
  folderopen: "files",
  health: "health_data",
  health_data: "health_data",
  vitals: "health_data",
  workflows: "work_sessions",
  workflow: "work_sessions",
  work_sessions: "work_sessions",
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
