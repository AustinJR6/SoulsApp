export type OutreachStatus = 'new' | 'drafted' | 'approved' | 'sent' | 'responded';

export type SessionStatus = 'running' | 'completed' | 'failed';

export interface OutreachSummary {
  draftsAwaitingApproval: number;
  prospectsFoundThisWeek: number;
  emailsApprovedThisWeek: number;
  sessionsRunThisWeek: number;
}

export interface OutreachSession {
  id: string;
  goal: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  summary: string;
  completionSummary: string;
}

export interface OutreachSessionTask {
  id: string;
  taskType: string;
  status: 'completed' | 'failed' | 'running';
  outputSummary: string;
  fullOutput: string;
}

export interface OutreachSessionDetail extends OutreachSession {
  tasks: OutreachSessionTask[];
}

export interface Prospect {
  id: string;
  companyName: string;
  location: string | null;
  contactName: string;
  contactTitle: string | null;
  contactEmail: string | null;
  status: OutreachStatus;
}

export interface ProspectDetail extends Prospect {
  notes: string | null;
  website: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailDraft {
  id: string;
  prospectId: string;
  companyName: string;
  contactName: string;
  contactTitle: string | null;
  contactEmail: string | null;
  subject: string;
  body: string;
  aiModel: 'claude' | 'sylana' | string;
  status: 'draft' | 'approved' | 'rejected' | string;
  draftedAt: string;
}

export interface DashboardPayload {
  summary: OutreachSummary;
  recentSessions: OutreachSession[];
}
