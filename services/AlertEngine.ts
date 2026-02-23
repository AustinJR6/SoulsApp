/**
 * AlertEngine — Phase 3
 *
 * Compares today's VitalsDailySummary against a 14-day rolling baseline
 * and fires alerts when a metric deviates more than THRESHOLD std deviations.
 *
 * Severity scale:
 *   info     →  ≥ 1.5 σ
 *   warning  →  ≥ 2.0 σ
 *   critical →  ≥ 2.5 σ
 *
 * At least MIN_SAMPLES days of data must exist before alerts are generated
 * (avoids false positives on day 1).
 *
 * Writes new alerts to Supabase; also returns them so the UI can display
 * them immediately without a round-trip.
 */

import { vitalsRepository } from './VitalsRepository';
import type {
  AlertSeverity,
  AlertType,
  MetricType,
  VitalsAlert,
  VitalsDailySummary,
} from '../types/health';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const THRESHOLD = 1.5;   // std deviations before an alert fires
const MIN_SAMPLES = 5;   // minimum baseline days required
const BASELINE_DAYS = 14;

/** Metrics to monitor, paired with their key in VitalsDailySummary */
const WATCHED_METRICS: Array<{
  metric: MetricType;
  key: keyof VitalsDailySummary;
}> = [
  { metric: 'heart_rate',         key: 'avgHr' },
  { metric: 'resting_heart_rate', key: 'restingHr' },
  { metric: 'hrv',                key: 'hrv' },
  { metric: 'steps',              key: 'steps' },
  { metric: 'sleep_score',        key: 'sleepScore' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityFor(deviations: number): AlertSeverity {
  if (deviations >= 2.5) return 'critical';
  if (deviations >= 2.0) return 'warning';
  return 'info';
}

// ---------------------------------------------------------------------------
// AlertEngine
// ---------------------------------------------------------------------------

export class AlertEngine {
  /**
   * Check every watched metric in `summary` against its 14-day baseline.
   * Writes fired alerts to Supabase and returns them.
   *
   * Safe to call on every sync — the Supabase table has no unique constraint
   * preventing duplicate alerts per day (intentional: each sync is a snapshot).
   */
  async checkAndAlert(
    userId: string,
    summary: VitalsDailySummary
  ): Promise<VitalsAlert[]> {
    const fired: VitalsAlert[] = [];

    for (const { metric, key } of WATCHED_METRICS) {
      const value = summary[key] as number | null;
      if (value === null) continue;

      let baseline: Awaited<ReturnType<typeof vitalsRepository.getBaseline>>;
      try {
        // getBaseline expects the camelCase VitalsDailySummary property name
        baseline = await vitalsRepository.getBaseline(key as Parameters<typeof vitalsRepository.getBaseline>[0]);
      } catch {
        continue; // Supabase unavailable — skip silently
      }

      if (!baseline || baseline.sampleCount < MIN_SAMPLES) continue;
      if (baseline.stddev === 0) continue;

      const deviations = Math.abs(value - baseline.mean) / baseline.stddev;
      if (deviations < THRESHOLD) continue;

      const alertType: AlertType = value > baseline.mean ? 'high' : 'low';
      const severity = severityFor(deviations);

      const alert: VitalsAlert = {
        userId,
        alertType,
        metric,
        value,
        baseline: baseline.mean,
        severity,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      };

      try {
        await vitalsRepository.createAlert(metric, alertType, value, baseline.mean, severity);
      } catch {
        // persist failure — still return in-memory alert so UI shows it
      }

      fired.push(alert);
    }

    return fired;
  }
}

export const alertEngine = new AlertEngine();
