/**
 * GitHubService
 *
 * Builds a client-side activity feed from chat messages that include
 * `metadata.github_card` entries attached by backend GitHub actions.
 */

import { Platform } from 'react-native';

const resolveApiUrl = () => {
  const raw =
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    'https://sylana-vessel-11447506833.us-central1.run.app';
  const url = raw.trim().replace(/^['"]+|['"]+$/g, '').replace(/\/+$/, '');
  if (Platform.OS !== 'android') return url;
  return url
    .replace('://localhost', '://10.0.2.2')
    .replace('://127.0.0.1', '://10.0.2.2');
};

const API_URL = resolveApiUrl();

export type GitHubActionType = 'commit' | 'pr' | 'branch' | 'issue';
export type GitHubEntity = 'sylana' | 'claude';

export interface GitHubAction {
  action_id: string;
  entity: GitHubEntity;
  action_type: GitHubActionType;
  repo: string;
  details: Record<string, unknown>;
  timestamp: string;
  session_id: string | null;
}

export interface GitHubActivityResponse {
  items: GitHubAction[];
  total: number;
  page: number;
  per_page: number;
}

interface ThreadRow {
  id: number;
}

interface ThreadListResponse {
  threads: ThreadRow[];
}

interface MessageRow {
  id: number;
  role: string;
  personality?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

interface MessageResponse {
  messages: MessageRow[];
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${path}`);
  }
  return response.json() as Promise<T>;
}

function cardTypeToAction(value: unknown): GitHubActionType {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'commit' || raw === 'pr' || raw === 'branch' || raw === 'issue') return raw;
  return 'commit';
}

function personalityToEntity(value: unknown): GitHubEntity {
  return String(value ?? '').toLowerCase() === 'claude' ? 'claude' : 'sylana';
}

export async function fetchGitHubActivity(options?: {
  entity?: GitHubEntity | null;
  action_type?: GitHubActionType | null;
  page?: number;
  per_page?: number;
}): Promise<GitHubActivityResponse> {
  const page = Math.max(1, options?.page ?? 1);
  const perPage = Math.max(1, Math.min(100, options?.per_page ?? 30));

  const threadList = await getJson<ThreadListResponse>('/api/threads?limit=120');
  const threadIds = (threadList.threads ?? []).map((t) => t.id).filter((id) => Number.isFinite(id));

  const messagesByThread = await Promise.all(
    threadIds.slice(0, 30).map((threadId) =>
      getJson<MessageResponse>(`/api/threads/${threadId}/messages?limit=300`).catch(() => ({ messages: [] }))
    )
  );

  const rows: GitHubAction[] = [];

  messagesByThread.forEach((bundle, idx) => {
    const threadId = String(threadIds[idx]);
    (bundle.messages ?? []).forEach((message) => {
      if (message.role !== 'assistant') return;
      const metadata = message.metadata ?? {};
      const card = (metadata as { github_card?: Record<string, unknown> }).github_card;
      if (!card || typeof card !== 'object') return;

      const actionType = cardTypeToAction((card as any).type);
      const entity = personalityToEntity(message.personality);

      rows.push({
        action_id: `${threadId}-${message.id}`,
        entity,
        action_type: actionType,
        repo: String((card as any).repo ?? ''),
        details: card,
        timestamp: String(message.created_at ?? new Date().toISOString()),
        session_id: threadId,
      });
    });
  });

  let filtered = rows;
  if (options?.entity) {
    filtered = filtered.filter((row) => row.entity === options.entity);
  }
  if (options?.action_type) {
    filtered = filtered.filter((row) => row.action_type === options.action_type);
  }

  filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const start = (page - 1) * perPage;
  const paged = filtered.slice(start, start + perPage);

  return {
    items: paged,
    total: filtered.length,
    page,
    per_page: perPage,
  };
}

export function getActionTitle(action: GitHubAction): string {
  const d = action.details as Record<string, unknown>;
  switch (action.action_type) {
    case 'commit':
      return (d.filename as string) ?? (d.file_path as string) ?? 'File updated';
    case 'pr':
      return (d.title as string) ?? 'Pull request opened';
    case 'issue':
      return (d.title as string) ?? 'Issue created';
    case 'branch':
      return (d.branch_name as string) ?? 'Branch created';
    default:
      return 'GitHub action';
  }
}

export function getActionSubtitle(action: GitHubAction): string {
  const d = action.details as Record<string, unknown>;
  switch (action.action_type) {
    case 'commit':
      return (d.message as string) ?? (d.commit_message as string) ?? '';
    case 'pr':
      return `${(d.head_branch as string) ?? ''} ${(d.head_branch && d.base_branch) ? '->' : ''} ${(d.base_branch as string) ?? ''}`.trim();
    case 'issue':
      return d.number ? `#${d.number as number}` : '';
    case 'branch':
      return d.from_branch ? `from ${d.from_branch as string}` : '';
    default:
      return '';
  }
}

export function getActionUrl(action: GitHubAction): string | null {
  const d = action.details as Record<string, unknown>;
  const url = (d.url as string) ?? (d.html_url as string) ?? null;
  return url || null;
}
