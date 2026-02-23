import { API_URL } from './api';
import type {
  DashboardPayload,
  EmailDraft,
  OutreachSession,
  OutreachSessionDetail,
  OutreachStatus,
  Prospect,
  ProspectDetail,
  SessionStatus,
} from '../types/outreach';

const BASE_CANDIDATES = [`${API_URL}/api/outreach`, `${API_URL}/outreach`];

function toString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function toNullableString(value: unknown): string | null {
  const str = toString(value, '');
  return str ? str : null;
}

function normalizeSessionStatus(value: unknown): SessionStatus {
  const status = toString(value, 'completed').toLowerCase();
  if (status === 'running' || status === 'failed') return status;
  return 'completed';
}

function normalizeProspectStatus(value: unknown): OutreachStatus {
  const status = toString(value, 'new').toLowerCase();
  if (status === 'drafted' || status === 'approved' || status === 'sent' || status === 'responded') return status;
  return 'new';
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let lastError: Error | null = null;

  for (const base of BASE_CANDIDATES) {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (response.status === 404) {
      lastError = new Error(`Endpoint not found: ${base}${path}`);
      continue;
    }

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${base}${path}: ${text}`);
    }

    try {
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      throw new Error(`Invalid JSON from ${base}${path}: ${text}`);
    }
  }

  throw lastError ?? new Error(`No outreach endpoint found for ${path}`);
}

function mapSession(raw: any): OutreachSession {
  return {
    id: toString(raw?.id),
    goal: toString(raw?.goal, 'No goal provided'),
    status: normalizeSessionStatus(raw?.status),
    startedAt: toString(raw?.started_at ?? raw?.startedAt ?? new Date().toISOString()),
    endedAt: toNullableString(raw?.ended_at ?? raw?.endedAt),
    summary: toString(raw?.summary, ''),
    completionSummary: toString(raw?.completion_summary ?? raw?.completionSummary ?? raw?.summary, ''),
  };
}

function mapProspect(raw: any): Prospect {
  return {
    id: toString(raw?.id),
    companyName: toString(raw?.company_name ?? raw?.companyName, 'Unknown company'),
    location: toNullableString(raw?.location),
    contactName: toString(raw?.contact_name ?? raw?.contactName, 'Unknown contact'),
    contactTitle: toNullableString(raw?.contact_title ?? raw?.contactTitle),
    contactEmail: toNullableString(raw?.contact_email ?? raw?.contactEmail),
    status: normalizeProspectStatus(raw?.status),
  };
}

function mapDraft(raw: any): EmailDraft {
  const prospect = raw?.prospect ?? {};

  return {
    id: toString(raw?.id),
    prospectId: toString(raw?.prospect_id ?? raw?.prospectId ?? prospect?.id),
    companyName: toString(raw?.company_name ?? raw?.companyName ?? prospect?.company_name ?? prospect?.companyName, 'Unknown company'),
    contactName: toString(raw?.contact_name ?? raw?.contactName ?? prospect?.contact_name ?? prospect?.contactName, 'Unknown contact'),
    contactTitle: toNullableString(raw?.contact_title ?? raw?.contactTitle ?? prospect?.contact_title ?? prospect?.contactTitle),
    contactEmail: toNullableString(raw?.contact_email ?? raw?.contactEmail ?? prospect?.contact_email ?? prospect?.contactEmail),
    subject: toString(raw?.subject, ''),
    body: toString(raw?.body, ''),
    aiModel: toString(raw?.ai_model ?? raw?.aiModel ?? raw?.drafted_by, 'sylana').toLowerCase(),
    status: toString(raw?.status, 'draft').toLowerCase(),
    draftedAt: toString(raw?.drafted_at ?? raw?.draftedAt ?? raw?.created_at ?? raw?.createdAt ?? new Date().toISOString()),
  };
}

export const outreachService = {
  async getDashboard(): Promise<DashboardPayload> {
    const data = await requestJson<any>('/dashboard');
    const summary = data?.summary ?? data;
    const recent = data?.recent_sessions ?? data?.recentSessions ?? [];

    return {
      summary: {
        draftsAwaitingApproval: Number(summary?.drafts_awaiting_approval ?? summary?.draftsAwaitingApproval ?? 0),
        prospectsFoundThisWeek: Number(summary?.prospects_found_this_week ?? summary?.prospectsFoundThisWeek ?? 0),
        emailsApprovedThisWeek: Number(summary?.emails_approved_this_week ?? summary?.emailsApprovedThisWeek ?? 0),
        sessionsRunThisWeek: Number(summary?.sessions_run_this_week ?? summary?.sessionsRunThisWeek ?? 0),
      },
      recentSessions: (Array.isArray(recent) ? recent : []).slice(0, 5).map(mapSession),
    };
  },

  async getDraftQueue(): Promise<EmailDraft[]> {
    const data = await requestJson<any>('/email-drafts?status=draft');
    const rows = Array.isArray(data) ? data : data?.items ?? data?.drafts ?? [];
    return rows.map(mapDraft);
  },

  async getDraftById(id: string): Promise<EmailDraft> {
    const data = await requestJson<any>(`/email-drafts/${id}`);
    return mapDraft(data);
  },

  async approveDraft(id: string, payload: { subject: string; body: string }): Promise<EmailDraft> {
    const data = await requestJson<any>(`/email-drafts/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return mapDraft(data);
  },

  async rejectDraft(id: string, payload: { subject: string; body: string }): Promise<EmailDraft> {
    const data = await requestJson<any>(`/email-drafts/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return mapDraft(data);
  },

  async getProspects(status?: OutreachStatus): Promise<Prospect[]> {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
    const data = await requestJson<any>(`/prospects${suffix}`);
    const rows = Array.isArray(data) ? data : data?.items ?? data?.prospects ?? [];
    return rows.map(mapProspect);
  },

  async getProspectById(id: string): Promise<ProspectDetail> {
    const data = await requestJson<any>(`/prospects/${id}`);
    const mapped = mapProspect(data);

    return {
      ...mapped,
      notes: toNullableString(data?.notes),
      website: toNullableString(data?.website),
      createdAt: toString(data?.created_at ?? data?.createdAt ?? new Date().toISOString()),
      updatedAt: toString(data?.updated_at ?? data?.updatedAt ?? new Date().toISOString()),
    };
  },

  async getRecentSessions(limit = 5): Promise<OutreachSession[]> {
    const data = await requestJson<any>(`/sessions?limit=${limit}`);
    const rows = Array.isArray(data) ? data : data?.items ?? data?.sessions ?? [];
    return rows.map(mapSession);
  },

  async getSessionById(id: string): Promise<OutreachSessionDetail> {
    const data = await requestJson<any>(`/sessions/${id}`);
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];

    return {
      ...mapSession(data),
      tasks: tasks.map((task: any) => ({
        id: toString(task?.id),
        taskType: toString(task?.task_type ?? task?.taskType, 'task'),
        status: toString(task?.status, 'completed').toLowerCase() === 'failed'
          ? 'failed'
          : toString(task?.status, 'completed').toLowerCase() === 'running'
            ? 'running'
            : 'completed',
        outputSummary: toString(task?.output_summary ?? task?.outputSummary, ''),
        fullOutput: toString(task?.full_output ?? task?.fullOutput, ''),
      })),
    };
  },
};
