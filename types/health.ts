// ---------------------------------------------------------------------------
// Health Vitals — TypeScript types
// Used by HealthService, Supabase schema, and the future Vitals dashboard
// ---------------------------------------------------------------------------

/** Matches the metric_type column in vitals_readings */
export type MetricType =
  | 'heart_rate'
  | 'resting_heart_rate'
  | 'hrv'
  | 'steps'
  | 'calories_active'
  | 'calories_total'
  | 'sleep_duration'
  | 'sleep_score'
  | 'stress_score';

/** Maps Health Connect integer stage codes to readable labels */
export type SleepStageType =
  | 'unknown'
  | 'awake'
  | 'sleeping'
  | 'out_of_bed'
  | 'light'
  | 'deep'
  | 'rem';

export interface SleepStage {
  stage: SleepStageType;
  startTime: string;   // ISO-8601
  endTime: string;     // ISO-8601
  durationMinutes: number;
}

/** A single raw reading stored in vitals_readings */
export interface VitalsRawReading {
  metricType: MetricType;
  value: number;
  unit: string;
  recordedAt: string;  // ISO-8601
  source: string;      // e.g. 'health_connect'
}

/** Aggregated day-level summary stored in vitals_daily_summary */
export interface VitalsDailySummary {
  date: string;                     // YYYY-MM-DD
  avgHr: number | null;
  restingHr: number | null;
  hrv: number | null;
  steps: number | null;
  caloriesActive: number | null;
  caloriesTotal: number | null;
  sleepDurationMinutes: number | null;
  sleepScore: number | null;        // 0-100 computed score
  sleepStages: SleepStage[] | null;
  stressScore: number | null;
  source: string;
}

/** Result of checking / requesting Health Connect permissions */
export interface PermissionStatus {
  granted: string[];
  denied: string[];
  allGranted: boolean;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType = 'high' | 'low' | 'missing';

/** Matches the vitals_alerts table */
export interface VitalsAlert {
  userId: string;
  alertType: AlertType;
  metric: MetricType;
  value: number;
  baseline: number;
  severity: AlertSeverity;
  createdAt: string;
  resolvedAt: string | null;
}
