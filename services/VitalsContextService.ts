/**
 * VitalsContextService
 *
 * Builds a compact one-line health snapshot for inclusion in every AI chat
 * message.  The backend AI sees it as structured context; the user's chat
 * bubble displays only their original text.
 *
 * Data source priority:
 *   1. Health Connect (device-local, no auth required) — always tried first
 *   2. Supabase vitals_daily_summary — used as fallback if HC is unavailable
 *
 * Returns an empty string when no data is available so chat is never blocked.
 *
 * Format example:
 *   [Health · Feb 22: 8,432 steps | sleep 7h 12m (score 78) | avg HR 68 bpm]
 */

import { healthService } from './HealthService';
import { vitalsRepository } from './VitalsRepository';
import type { VitalsAlert, VitalsDailySummary } from '../types/health';

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

function formatVitalsCompact(
  today: VitalsDailySummary | null,
  alerts: VitalsAlert[]
): string {
  if (!today) return '';

  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const parts: string[] = [];

  if (today.steps !== null) {
    parts.push(`${today.steps.toLocaleString()} steps`);
  }

  if (today.sleepDurationMinutes !== null) {
    const h = Math.floor(today.sleepDurationMinutes / 60);
    const m = today.sleepDurationMinutes % 60;
    const score = today.sleepScore !== null ? ` (score ${today.sleepScore})` : '';
    parts.push(h > 0 ? `sleep ${h}h ${m}m${score}` : `sleep ${m}m${score}`);
  }

  if (today.avgHr !== null) parts.push(`avg HR ${today.avgHr} bpm`);
  if (today.restingHr !== null) parts.push(`resting HR ${today.restingHr} bpm`);
  if (today.hrv !== null) parts.push(`HRV ${today.hrv} ms`);
  if (today.caloriesActive !== null) parts.push(`${today.caloriesActive} kcal active`);

  if (parts.length === 0) return '';

  const alertPart =
    alerts.length > 0
      ? ` | Alerts: ${alerts
          .slice(0, 3)
          .map((a) => `${a.metric.replace(/_/g, ' ')} ${a.alertType} (${a.severity})`)
          .join(', ')}`
      : '';

  return `[Health · ${date}: ${parts.join(' | ')}${alertPart}]`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a compact health context string for inclusion in AI chat messages.
 *
 * Reads directly from Health Connect on-device (no Supabase / auth required).
 * Falls back to the Supabase daily summary if Health Connect is unavailable.
 * Returns '' on all failures so chat is never blocked.
 */
export async function buildHealthContext(): Promise<string> {
  let today: VitalsDailySummary | null = null;
  let alerts: VitalsAlert[] = [];

  // ── Primary: Health Connect (device-local, always fresh) ──────────────────
  try {
    // healthService.initialize() is idempotent and fast after the first call
    const available = await healthService.initialize();
    if (available) {
      today = await healthService.fetchDailySummary(new Date());
    }
  } catch {
    // Health Connect unavailable — fall through to Supabase
  }

  // ── Fallback: Supabase daily summary (requires auth + migration) ───────────
  if (!today) {
    try {
      today = await vitalsRepository.getSummaryForDate(
        new Date().toISOString().split('T')[0]
      );
    } catch {
      // Supabase unavailable — context will be empty
    }
  }

  // ── Best-effort: active alerts from Supabase ──────────────────────────────
  try {
    alerts = await vitalsRepository.getActiveAlerts();
  } catch {
    // No alerts available — omit from context
  }

  return formatVitalsCompact(today, alerts);
}
