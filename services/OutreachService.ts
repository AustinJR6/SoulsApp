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

const BASE_CANDIDATES = [`${API_URL}`];

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
  if (status === 'responded') return 'responded';
  if (status === 'sent' || status === 'email_sent' || status === 'opened' || status === 'clicked') return 'sent';
  if (status === 'approved') return 'approved';
  if (status === 'drafted' || status === 'email_drafted') return 'drafted';
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

    const text = await response.text();
    if (!response.ok) {
      lastError = new Error(`HTTP ${response.status} from ${base}${path}: ${text}`);
      continue;
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
    id: toString(raw?.session_id ?? raw?.id),
    goal: toString(raw?.goal, 'No goal provided'),
    status: normalizeSessionStatus(raw?.status),
    startedAt: toString(raw?.started_at ?? raw?.startedAt ?? raw?.created_at ?? raw?.createdAt ?? new Date().toISOString()),
    endedAt: toNullableString(raw?.completed_at ?? raw?.ended_at ?? raw?.endedAt),
    summary: toString(raw?.summary, ''),
    completionSummary: toString(raw?.completion_summary ?? raw?.completionSummary ?? raw?.summary, ''),
  };
}

function mapProspect(raw: any): Prospect {
  return {
    id: toString(raw?.prospect_id ?? raw?.id),
    companyName: toString(raw?.company_name ?? raw?.companyName, 'Unknown company'),
    location: toNullableString(raw?.location),
    contactName: toString(raw?.contact_name ?? raw?.contactName, 'Unknown contact'),
    contactTitle: toNullableString(raw?.contact_title ?? raw?.contactTitle),
    contactEmail: toNullableString(raw?.email ?? raw?.contact_email ?? raw?.contactEmail),
    status: normalizeProspectStatus(raw?.status),
  };
}

function mapDraft(raw: any): EmailDraft {
  const prospect = raw?.prospect ?? {};

  return {
    id: toString(raw?.draft_id ?? raw?.id),
    prospectId: toString(raw?.prospect_id ?? raw?.prospectId ?? prospect?.prospect_id ?? prospect?.id),
    companyName: toString(raw?.company_name ?? raw?.companyName ?? prospect?.company_name ?? prospect?.companyName, 'Unknown company'),
    contactName: toString(raw?.contact_name ?? raw?.contactName ?? prospect?.contact_name ?? prospect?.contactName, 'Unknown contact'),
    contactTitle: toNullableString(raw?.contact_title ?? raw?.contactTitle ?? prospect?.contact_title ?? prospect?.contactTitle),
    contactEmail: toNullableString(raw?.email ?? raw?.contact_email ?? raw?.contactEmail ?? prospect?.email ?? prospect?.contact_email ?? prospect?.contactEmail),
    subject: toString(raw?.subject, ''),
    body: toString(raw?.body, ''),
    aiModel: toString(raw?.entity ?? raw?.ai_model ?? raw?.aiModel ?? raw?.drafted_by, 'sylana').toLowerCase(),
    status: toString(raw?.status, 'draft').toLowerCase(),
    draftedAt: toString(raw?.created_at ?? raw?.drafted_at ?? raw?.draftedAt ?? new Date().toISOString()),
  };
}

export const outreachService = {
  async getDashboard(): Promise<DashboardPayload> {
    const [draftRows, prospects, sessions] = await Promise.all([
      requestJson<any>('/email-drafts'),
      outreachService.getProspects(),
      outreachService.getRecentSessions(5),
    ]);

    const drafts: EmailDraft[] = (Array.isArray(draftRows) ? draftRows : draftRows?.items ?? draftRows?.drafts ?? []).map(mapDraft);

    return {
      summary: {
        draftsAwaitingApproval: drafts.filter((d) => d.status === 'draft').length,
        prospectsFoundThisWeek: prospects.length,
        emailsApprovedThisWeek: drafts.filter((d) => d.status === 'approved').length,
        sessionsRunThisWeek: sessions.length,
      },
      recentSessions: sessions.slice(0, 5),
    };
  },

  async getDraftQueue(): Promise<EmailDraft[]> {
    const data = await requestJson<any>('/email-drafts');
    const rows = Array.isArray(data) ? data : data?.items ?? data?.drafts ?? [];
    return rows.map(mapDraft);
  },

  async getDraftById(id: string): Promise<EmailDraft> {
    const drafts = await outreachService.getDraftQueue();
    const found = drafts.find((d) => d.id === id);
    if (!found) throw new Error(`Draft not found: ${id}`);
    return found;
  },

  async approveDraft(id: string, payload: { subject: string; body: string }): Promise<EmailDraft> {
    const current = await outreachService.getDraftById(id).catch(() => ({
      id,
      prospectId: '',
      companyName: 'Unknown company',
      contactName: 'Unknown contact',
      contactTitle: null,
      contactEmail: null,
      subject: payload.subject,
      body: payload.body,
      aiModel: 'sylana',
      status: 'draft',
      draftedAt: new Date().toISOString(),
    } as EmailDraft));

    await requestJson<any>(`/email-drafts/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });

    return {
      ...current,
      subject: payload.subject,
      body: payload.body,
      status: 'approved',
    };
  },

  async rejectDraft(id: string, payload: { subject: string; body: string }): Promise<EmailDraft> {
    const current = await outreachService.getDraftById(id).catch(() => ({
      id,
      prospectId: '',
      companyName: 'Unknown company',
      contactName: 'Unknown contact',
      contactTitle: null,
      contactEmail: null,
      subject: payload.subject,
      body: payload.body,
      aiModel: 'sylana',
      status: 'draft',
      draftedAt: new Date().toISOString(),
    } as EmailDraft));

    await requestJson<any>(`/email-drafts/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ feedback: payload.body?.slice(0, 280) || payload.subject || 'Needs revision' }),
    });

    return {
      ...current,
      status: 'rejected',
    };
  },

  async sendDraft(id: string): Promise<{ success: boolean; status: string }> {
    const data = await requestJson<any>(`/email-drafts/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return {
      success: Boolean(data?.success),
      status: toString(data?.status, 'sent'),
    };
  },

  async sendApprovedBatch(limit = 20): Promise<{ success: boolean; sent: number }> {
    const data = await requestJson<any>('/email-drafts/send-approved-batch', {
      method: 'POST',
      body: JSON.stringify({ limit }),
    });
    return {
      success: Boolean(data?.success),
      sent: Number(data?.sent ?? 0),
    };
  },

  async getProspects(status?: OutreachStatus): Promise<Prospect[]> {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
    const data = await requestJson<any>(`/prospects${suffix}`);
    const rows = Array.isArray(data) ? data : data?.items ?? data?.prospects ?? [];
    return rows.map(mapProspect);
  },

  async getProspectById(id: string): Promise<ProspectDetail> {
    const data = await requestJson<any>(`/prospects/${id}`);
    const raw = data?.prospect ?? data;
    const mapped = mapProspect(raw);

    return {
      ...mapped,
      notes: toNullableString(raw?.notes),
      website: toNullableString(raw?.website),
      createdAt: toString(raw?.created_at ?? raw?.createdAt ?? new Date().toISOString()),
      updatedAt: toString(raw?.updated_at ?? raw?.updatedAt ?? new Date().toISOString()),
    };
  },

  async getRecentSessions(limit = 5): Promise<OutreachSession[]> {
    const data = await requestJson<any>(`/sessions?page=1&page_size=${limit}`);
    const rows = Array.isArray(data) ? data : data?.items ?? data?.sessions ?? [];
    return rows.map(mapSession);
  },

  async getSessionById(id: string): Promise<OutreachSessionDetail> {
    const data = await requestJson<any>(`/sessions/${id}`);
    const raw = data?.session ?? data;
    const tasks = Array.isArray(raw?.tasks) ? raw.tasks : [];

    return {
      ...mapSession(raw),
      tasks: tasks.map((task: any) => ({
        id: toString(task?.task_id ?? task?.id),
        taskType: toString(task?.task_type ?? task?.taskType, 'task'),
        status: toString(task?.status, 'completed').toLowerCase() === 'failed'
          ? 'failed'
          : toString(task?.status, 'completed').toLowerCase() === 'running'
            ? 'running'
            : 'completed',
        outputSummary: toString(task?.summary ?? task?.output_summary ?? task?.outputSummary, ''),
        fullOutput: toString(task?.output ? JSON.stringify(task.output) : task?.full_output ?? task?.fullOutput ?? ''),
      })),
    };
  },

  async runProspectResearch(count = 2, product: 'manifest' | 'onevine' = 'manifest', entity: 'claude' | 'sylana' = 'claude') {
    return requestJson<any>('/sessions/run-prospect-research', {
      method: 'POST',
      body: JSON.stringify({ count, product, entity }),
    });
  },
};
