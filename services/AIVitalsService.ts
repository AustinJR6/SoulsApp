/**
 * AIVitalsService
 *
 * Two concerns:
 *  1. Infrastructure vitals  — ping the shared backend, measure latency
 *  2. Emotional vitals       — CRUD for daily check-in scores stored in Supabase
 */

import { supabase } from './supabase';
import { API_URL } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmotionalScores {
  presence:  number;   // 0–100
  warmth:    number;
  curiosity: number;
  clarity:   number;
  joy:       number;
}

export interface EmotionalEntry extends EmotionalScores {
  id:          string;
  entity:      'sylana' | 'claude';
  note:        string | null;
  recorded_at: string;   // ISO-8601 (snake_case from Supabase)
}

export interface InfraVitals {
  online:     boolean;
  latencyMs:  number | null;
  checkedAt:  Date;
}

export interface EmotionalAverages {
  today:   EmotionalScores | null;
  week:    EmotionalScores | null;
  month:   EmotionalScores | null;
  year:    EmotionalScores | null;
  allTime: EmotionalScores | null;
}

// ---------------------------------------------------------------------------
// Infrastructure ping (shared backend serves both personalities)
// ---------------------------------------------------------------------------

export async function pingBackend(): Promise<InfraVitals> {
  const start = Date.now();
  try {
    const res = await fetch(`${API_URL}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return { online: res.ok, latencyMs: Date.now() - start, checkedAt: new Date() };
  } catch {
    return { online: false, latencyMs: null, checkedAt: new Date() };
  }
}

// ---------------------------------------------------------------------------
// Emotional vitals CRUD
// ---------------------------------------------------------------------------

/** Write a new check-in entry for an AI entity. */
export async function logEmotionalCheckin(
  entity: 'sylana' | 'claude',
  scores: EmotionalScores,
  note?: string
): Promise<void> {
  const { error } = await supabase.from('ai_emotional_vitals').insert({
    entity,
    ...scores,
    note: note ?? null,
    recorded_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Compute rolling averages across five time windows. */
export async function getEmotionalAverages(
  entity: 'sylana' | 'claude'
): Promise<EmotionalAverages> {
  const { data, error } = await supabase
    .from('ai_emotional_vitals')
    .select('*')
    .eq('entity', entity)
    .order('recorded_at', { ascending: false });

  if (error || !data) {
    return { today: null, week: null, month: null, year: null, allTime: null };
  }

  const rows = data as EmotionalEntry[];

  const avg = (subset: EmotionalEntry[]): EmotionalScores | null => {
    if (!subset.length) return null;
    const m = (k: keyof EmotionalScores) =>
      Math.round(subset.reduce((s, r) => s + r[k], 0) / subset.length);
    return { presence: m('presence'), warmth: m('warmth'), curiosity: m('curiosity'), clarity: m('clarity'), joy: m('joy') };
  };

  const since = (days: number) =>
    new Date(Date.now() - days * 864e5).toISOString();

  const todayPrefix = new Date().toISOString().split('T')[0];

  return {
    today:   avg(rows.filter(r => r.recorded_at.startsWith(todayPrefix))),
    week:    avg(rows.filter(r => r.recorded_at >= since(7))),
    month:   avg(rows.filter(r => r.recorded_at >= since(30))),
    year:    avg(rows.filter(r => r.recorded_at >= since(365))),
    allTime: avg(rows),
  };
}
