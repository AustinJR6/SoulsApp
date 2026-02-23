/**
 * VitalsRepository — Phase 2
 *
 * All Supabase read/write operations for the vitals schema.
 * Consumed by HealthService.syncToday() and the future Vitals dashboard.
 */

import { supabase } from './supabase';
import type {
  VitalsRawReading,
  VitalsDailySummary,
  VitalsAlert,
  MetricType,
  AlertSeverity,
  AlertType,
} from '../types/health';

// ---------------------------------------------------------------------------
// Internal row types (snake_case ↔ camelCase mapping)
// ---------------------------------------------------------------------------

interface DailySummaryRow {
  id?: string;
  user_id: string;
  date: string;
  avg_hr: number | null;
  resting_hr: number | null;
  hrv: number | null;
  steps: number | null;
  calories_active: number | null;
  calories_total: number | null;
  sleep_duration_minutes: number | null;
  sleep_score: number | null;
  sleep_stages: unknown;
  stress_score: number | null;
  source: string;
  synced_at?: string;
}

interface ReadingRow {
  user_id: string;
  metric_type: string;
  value: number;
  unit: string;
  recorded_at: string;
  source: string;
}

interface AlertRow {
  user_id: string;
  alert_type: string;
  metric: string;
  value: number;
  baseline: number;
  severity: string;
  created_at?: string;
  resolved_at: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toRow(userId: string, s: VitalsDailySummary): DailySummaryRow {
  return {
    user_id: userId,
    date: s.date,
    avg_hr: s.avgHr,
    resting_hr: s.restingHr,
    hrv: s.hrv,
    steps: s.steps,
    calories_active: s.caloriesActive,
    calories_total: s.caloriesTotal,
    sleep_duration_minutes: s.sleepDurationMinutes,
    sleep_score: s.sleepScore,
    sleep_stages: s.sleepStages,
    stress_score: s.stressScore,
    source: s.source,
    synced_at: new Date().toISOString(),
  };
}

function fromRow(row: DailySummaryRow): VitalsDailySummary {
  return {
    date: row.date,
    avgHr: row.avg_hr,
    restingHr: row.resting_hr,
    hrv: row.hrv,
    steps: row.steps,
    caloriesActive: row.calories_active,
    caloriesTotal: row.calories_total,
    sleepDurationMinutes: row.sleep_duration_minutes,
    sleepScore: row.sleep_score,
    sleepStages: row.sleep_stages as VitalsDailySummary['sleepStages'],
    stressScore: row.stress_score,
    source: row.source,
  };
}

// ---------------------------------------------------------------------------
// VitalsRepository
// ---------------------------------------------------------------------------

export class VitalsRepository {
  // -------------------------------------------------------------------------
  // Auth helper
  // -------------------------------------------------------------------------

  /** Returns the current Supabase user ID, or throws if not authenticated. */
  private async getUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw new Error('[VitalsRepository] User not authenticated. Sign in before syncing vitals.');
    }
    return data.user.id;
  }

  // -------------------------------------------------------------------------
  // Daily summary
  // -------------------------------------------------------------------------

  /**
   * Upserts a daily summary row.
   * Safe to call repeatedly — won't create duplicates (unique on user_id + date).
   */
  async upsertDailySummary(summary: VitalsDailySummary): Promise<void> {
    const userId = await this.getUserId();
    const row = toRow(userId, summary);

    const { error } = await supabase
      .from('vitals_daily_summary')
      .upsert(row, { onConflict: 'user_id,date' });

    if (error) throw new Error(`[VitalsRepository] upsertDailySummary: ${error.message}`);
  }

  /** Fetches the last N days of daily summaries, newest first. */
  async getRecentSummaries(days = 7): Promise<VitalsDailySummary[]> {
    const userId = await this.getUserId();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
      .from('vitals_daily_summary')
      .select('*')
      .eq('user_id', userId)
      .gte('date', since.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) throw new Error(`[VitalsRepository] getRecentSummaries: ${error.message}`);
    return (data ?? []).map(fromRow);
  }

  /** Fetches exactly one summary for the given YYYY-MM-DD date, or null. */
  async getSummaryForDate(date: string): Promise<VitalsDailySummary | null> {
    const userId = await this.getUserId();

    const { data, error } = await supabase
      .from('vitals_daily_summary')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();

    if (error) throw new Error(`[VitalsRepository] getSummaryForDate: ${error.message}`);
    return data ? fromRow(data as DailySummaryRow) : null;
  }

  // -------------------------------------------------------------------------
  // Raw readings
  // -------------------------------------------------------------------------

  /**
   * Batch-inserts raw readings.
   * Uses onConflict: ignore to safely skip duplicates (dedup index).
   */
  async insertRawReadings(readings: VitalsRawReading[]): Promise<void> {
    if (readings.length === 0) return;
    const userId = await this.getUserId();

    const rows: ReadingRow[] = readings.map((r) => ({
      user_id: userId,
      metric_type: r.metricType,
      value: r.value,
      unit: r.unit,
      recorded_at: r.recordedAt,
      source: r.source,
    }));

    const { error } = await supabase
      .from('vitals_readings')
      .upsert(rows, { onConflict: 'user_id,metric_type,recorded_at,source', ignoreDuplicates: true });

    if (error) throw new Error(`[VitalsRepository] insertRawReadings: ${error.message}`);
  }

  // -------------------------------------------------------------------------
  // Baseline — used by Phase 3 alert logic
  // -------------------------------------------------------------------------

  /**
   * Returns the rolling 14-day mean and stddev for a given metric.
   * Excludes today (incomplete day).
   */
  async getBaseline(
    metric: keyof Pick<
      VitalsDailySummary,
      'avgHr' | 'restingHr' | 'hrv' | 'steps' | 'caloriesActive' | 'sleepDurationMinutes' | 'sleepScore'
    >
  ): Promise<{ mean: number; stddev: number; sampleCount: number } | null> {
    const userId = await this.getUserId();

    const today = new Date().toISOString().split('T')[0];
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceStr = since.toISOString().split('T')[0];

    const colMap: Record<string, string> = {
      avgHr: 'avg_hr',
      restingHr: 'resting_hr',
      hrv: 'hrv',
      steps: 'steps',
      caloriesActive: 'calories_active',
      sleepDurationMinutes: 'sleep_duration_minutes',
      sleepScore: 'sleep_score',
    };
    const col = colMap[metric];

    const { data, error } = await supabase
      .from('vitals_daily_summary')
      .select(col)
      .eq('user_id', userId)
      .gte('date', sinceStr)
      .lt('date', today)
      .not(col, 'is', null);

    if (error) throw new Error(`[VitalsRepository] getBaseline: ${error.message}`);
    const values: number[] = (data ?? []).map((row: any) => row[col]);
    if (values.length < 3) return null; // not enough data for a meaningful baseline

    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    return { mean, stddev: Math.sqrt(variance), sampleCount: values.length };
  }

  // -------------------------------------------------------------------------
  // Alerts
  // -------------------------------------------------------------------------

  /** Inserts a new alert. */
  async createAlert(
    metric: MetricType,
    alertType: AlertType,
    value: number,
    baseline: number,
    severity: AlertSeverity
  ): Promise<void> {
    const userId = await this.getUserId();

    const row: AlertRow = {
      user_id: userId,
      alert_type: alertType,
      metric,
      value,
      baseline,
      severity,
      resolved_at: null,
    };

    const { error } = await supabase.from('vitals_alerts').insert(row);
    if (error) throw new Error(`[VitalsRepository] createAlert: ${error.message}`);
  }

  /** Returns all unresolved alerts for the current user, newest first. */
  async getActiveAlerts(): Promise<VitalsAlert[]> {
    const userId = await this.getUserId();

    const { data, error } = await supabase
      .from('vitals_alerts')
      .select('*')
      .eq('user_id', userId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[VitalsRepository] getActiveAlerts: ${error.message}`);

    return (data ?? []).map(
      (row: any): VitalsAlert => ({
        userId: row.user_id,
        alertType: row.alert_type as AlertType,
        metric: row.metric as MetricType,
        value: row.value,
        baseline: row.baseline,
        severity: row.severity as AlertSeverity,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
      })
    );
  }

  /** Marks an alert resolved by its metric (resolves most-recent matching active alert). */
  async resolveAlert(metric: MetricType): Promise<void> {
    const userId = await this.getUserId();

    // Find the most recent unresolved alert for this metric
    const { data, error: fetchError } = await supabase
      .from('vitals_alerts')
      .select('id')
      .eq('user_id', userId)
      .eq('metric', metric)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) throw new Error(`[VitalsRepository] resolveAlert fetch: ${fetchError.message}`);
    if (!data) return;

    const { error: updateError } = await supabase
      .from('vitals_alerts')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', data.id);

    if (updateError) throw new Error(`[VitalsRepository] resolveAlert update: ${updateError.message}`);
  }
}

export const vitalsRepository = new VitalsRepository();
