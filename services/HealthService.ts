/**
 * HealthService — Phase 1 + 2
 *
 * Wraps react-native-health-connect to:
 *  • initialize the Health Connect SDK
 *  • request / check permissions
 *  • fetch daily readings for every supported metric
 *  • aggregate a VitalsDailySummary for a given date
 *  • sync today's summary + raw readings to Supabase (syncToday)
 *
 * Requires a dev-client build (not Expo Go).
 * Run: npx eas build --platform android --profile development
 */

import {
  initialize,
  requestPermission,
  readRecords,
  getGrantedPermissions,
} from 'react-native-health-connect';
import type { Permission } from 'react-native-health-connect';
import { vitalsRepository } from './VitalsRepository';

import type {
  MetricType,
  PermissionStatus,
  SleepStage,
  SleepStageType,
  VitalsDailySummary,
  VitalsRawReading,
} from '../types/health';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
];

const ALL_RECORD_TYPES = PERMISSIONS.map((p) => p.recordType);

/**
 * Health Connect sleep stage integer → human-readable label.
 * Values come from androidx.health.connect.client.records.SleepSessionRecord.
 */
const SLEEP_STAGE_MAP: Record<number, SleepStageType> = {
  0: 'unknown',
  1: 'awake',
  2: 'sleeping',
  3: 'out_of_bed',
  4: 'light',
  5: 'deep',
  6: 'rem',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIso(date: Date): string {
  return date.toISOString();
}

/** Returns midnight-to-23:59:59.999 bounds for a given date */
function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

// ---------------------------------------------------------------------------
// HealthService
// ---------------------------------------------------------------------------

export class HealthService {
  private initialized = false;

  // -------------------------------------------------------------------------
  // Initialisation & permissions
  // -------------------------------------------------------------------------

  /** Must be called before any read operations. Returns false if HC unavailable. */
  async initialize(): Promise<boolean> {
    try {
      const available = await initialize();
      this.initialized = available;
      return available;
    } catch (err) {
      console.warn('[HealthService] initialize failed:', err);
      return false;
    }
  }

  /** Prompts the user with the Health Connect permission sheet. */
  async requestPermissions(): Promise<PermissionStatus> {
    if (!this.initialized) await this.initialize();
    try {
      const granted = await requestPermission(PERMISSIONS);
      const grantedTypes = granted.map((p) => p.recordType);
      const denied = ALL_RECORD_TYPES.filter((t) => !grantedTypes.includes(t));
      return { granted: grantedTypes, denied, allGranted: denied.length === 0 };
    } catch (err) {
      console.warn('[HealthService] requestPermissions failed:', err);
      return { granted: [], denied: ALL_RECORD_TYPES, allGranted: false };
    }
  }

  /** Checks which permissions are already granted without prompting. */
  async checkPermissions(): Promise<PermissionStatus> {
    try {
      const granted = await getGrantedPermissions();
      const grantedTypes = granted
        .filter((p) => p.accessType === 'read')
        .map((p) => p.recordType);
      const denied = ALL_RECORD_TYPES.filter((t) => !grantedTypes.includes(t));
      return { granted: grantedTypes, denied, allGranted: denied.length === 0 };
    } catch {
      return { granted: [], denied: ALL_RECORD_TYPES, allGranted: false };
    }
  }

  // -------------------------------------------------------------------------
  // Individual metric fetchers
  // -------------------------------------------------------------------------

  /** Average heart rate (bpm) over the given window, or null if no data. */
  async fetchHeartRate(start: Date, end: Date): Promise<number | null> {
    try {
      const { records } = await readRecords('HeartRate', {
        timeRangeFilter: { operator: 'between', startTime: toIso(start), endTime: toIso(end) },
      });
      const bpms: number[] = (records as any[]).flatMap((r) =>
        (r.samples ?? []).map((s: any) => s.beatsPerMinute)
      );
      return average(bpms);
    } catch {
      return null;
    }
  }

  /** Most recent resting HR recorded that day, or null. */
  async fetchRestingHeartRate(start: Date, end: Date): Promise<number | null> {
    try {
      const { records } = await readRecords('RestingHeartRate', {
        timeRangeFilter: { operator: 'between', startTime: toIso(start), endTime: toIso(end) },
      });
      if (records.length === 0) return null;
      const last = records[records.length - 1] as any;
      return Math.round(last.beatsPerMinute);
    } catch {
      return null;
    }
  }

  /**
   * Longest sleep session of the day.
   * Returns duration, parsed stages, and a computed 0-100 quality score.
   */
  async fetchSleepSessions(
    start: Date,
    end: Date
  ): Promise<{ durationMinutes: number | null; stages: SleepStage[]; score: number | null }> {
    try {
      const { records } = await readRecords('SleepSession', {
        timeRangeFilter: { operator: 'between', startTime: toIso(start), endTime: toIso(end) },
      });
      if (records.length === 0) return { durationMinutes: null, stages: [], score: null };

      // Use the longest session as the primary sleep for the night
      const session = (records as any[]).reduce((best, r) => {
        const dur = new Date(r.endTime).getTime() - new Date(r.startTime).getTime();
        const bestDur = new Date(best.endTime).getTime() - new Date(best.startTime).getTime();
        return dur > bestDur ? r : best;
      });

      const durationMinutes = Math.round(
        (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60_000
      );

      const stages: SleepStage[] = (session.stages ?? []).map((s: any) => ({
        stage: SLEEP_STAGE_MAP[s.stage] ?? 'unknown',
        startTime: s.startTime,
        endTime: s.endTime,
        durationMinutes: Math.round(
          (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60_000
        ),
      }));

      // Sleep score: weighted blend of duration vs 8 h target + deep/REM ratio
      const sleepMinutes = stages
        .filter((s) => !['awake', 'out_of_bed', 'unknown'].includes(s.stage))
        .reduce((sum, s) => sum + s.durationMinutes, 0);
      const deepRemMinutes = stages
        .filter((s) => s.stage === 'deep' || s.stage === 'rem')
        .reduce((sum, s) => sum + s.durationMinutes, 0);

      let score: number | null = null;
      if (durationMinutes > 0) {
        const durationScore = Math.min(100, (durationMinutes / 480) * 100);
        const qualityScore =
          sleepMinutes > 0 ? Math.min(100, (deepRemMinutes / sleepMinutes) * 200) : 0;
        score = Math.round(durationScore * 0.6 + qualityScore * 0.4);
      }

      return { durationMinutes, stages, score };
    } catch {
      return { durationMinutes: null, stages: [], score: null };
    }
  }

  /** Total step count for the window. */
  async fetchSteps(start: Date, end: Date): Promise<number | null> {
    try {
      const { records } = await readRecords('Steps', {
        timeRangeFilter: { operator: 'between', startTime: toIso(start), endTime: toIso(end) },
      });
      if (records.length === 0) return null;
      return (records as any[]).reduce((sum, r) => sum + r.count, 0);
    } catch {
      return null;
    }
  }

  /** Active and total calories burned (kcal) for the window. */
  async fetchCalories(
    start: Date,
    end: Date
  ): Promise<{ active: number | null; total: number | null }> {
    try {
      const [activeRes, totalRes] = await Promise.all([
        readRecords('ActiveCaloriesBurned', {
          timeRangeFilter: { operator: 'between', startTime: toIso(start), endTime: toIso(end) },
        }),
        readRecords('TotalCaloriesBurned', {
          timeRangeFilter: { operator: 'between', startTime: toIso(start), endTime: toIso(end) },
        }),
      ]);

      const active =
        activeRes.records.length > 0
          ? Math.round(
              (activeRes.records as any[]).reduce(
                (sum, r) => sum + (r.energy?.inKilocalories ?? 0),
                0
              )
            )
          : null;

      const total =
        totalRes.records.length > 0
          ? Math.round(
              (totalRes.records as any[]).reduce(
                (sum, r) => sum + (r.energy?.inKilocalories ?? 0),
                0
              )
            )
          : null;

      return { active, total };
    } catch {
      return { active: null, total: null };
    }
  }

  /** Average HRV (RMSSD, ms) for the window. Samsung Health writes this nightly. */
  async fetchHRV(start: Date, end: Date): Promise<number | null> {
    try {
      const { records } = await readRecords('HeartRateVariabilityRmssd', {
        timeRangeFilter: { operator: 'between', startTime: toIso(start), endTime: toIso(end) },
      });
      if (records.length === 0) return null;
      const values = (records as any[]).map((r) => r.heartRateVariabilityMillis);
      return average(values);
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Aggregated daily summary
  // -------------------------------------------------------------------------

  /**
   * Fetches all metrics in parallel for the given date and returns a
   * VitalsDailySummary ready to be written to Supabase.
   */
  async fetchDailySummary(date: Date): Promise<VitalsDailySummary> {
    const { start, end } = dayBounds(date);

    const [hr, restingHr, sleep, steps, calories, hrv] = await Promise.all([
      this.fetchHeartRate(start, end),
      this.fetchRestingHeartRate(start, end),
      this.fetchSleepSessions(start, end),
      this.fetchSteps(start, end),
      this.fetchCalories(start, end),
      this.fetchHRV(start, end),
    ]);

    return {
      date: date.toISOString().split('T')[0],
      avgHr: hr,
      restingHr,
      hrv,
      steps,
      caloriesActive: calories.active,
      caloriesTotal: calories.total,
      sleepDurationMinutes: sleep.durationMinutes,
      sleepScore: sleep.score,
      sleepStages: sleep.stages.length > 0 ? sleep.stages : null,
      stressScore: null, // Samsung Health does not expose stress via Health Connect yet
      source: 'health_connect',
    };
  }

  // -------------------------------------------------------------------------
  // Raw readings (for vitals_readings table — used in Phase 2)
  // -------------------------------------------------------------------------

  /**
   * Returns individual time-stamped samples for heart rate, resting HR, and HRV.
   * Steps / calories are stored as totals in the daily summary instead.
   */
  async getRawReadings(date: Date): Promise<VitalsRawReading[]> {
    const { start, end } = dayBounds(date);
    const readings: VitalsRawReading[] = [];

    const push = (
      metricType: MetricType,
      value: number,
      unit: string,
      recordedAt: string
    ) => readings.push({ metricType, value, unit, recordedAt, source: 'health_connect' });

    // Heart rate samples
    try {
      const { records } = await readRecords('HeartRate', {
        timeRangeFilter: { operator: 'between', startTime: toIso(start), endTime: toIso(end) },
      });
      for (const record of records as any[]) {
        for (const sample of record.samples ?? []) {
          push('heart_rate', sample.beatsPerMinute, 'bpm', sample.time);
        }
      }
    } catch { /* metric unavailable — continue */ }

    // Resting heart rate
    try {
      const { records } = await readRecords('RestingHeartRate', {
        timeRangeFilter: { operator: 'between', startTime: toIso(start), endTime: toIso(end) },
      });
      for (const record of records as any[]) {
        push('resting_heart_rate', record.beatsPerMinute, 'bpm', record.time);
      }
    } catch { /* metric unavailable — continue */ }

    // HRV
    try {
      const { records } = await readRecords('HeartRateVariabilityRmssd', {
        timeRangeFilter: { operator: 'between', startTime: toIso(start), endTime: toIso(end) },
      });
      for (const record of records as any[]) {
        push('hrv', record.heartRateVariabilityMillis, 'ms', record.time);
      }
    } catch { /* metric unavailable — continue */ }

    return readings;
  }

  // -------------------------------------------------------------------------
  // Sync to Supabase (Phase 2)
  // -------------------------------------------------------------------------

  /**
   * Full sync for a given date:
   *  1. Fetch daily summary from Health Connect
   *  2. Upsert it into vitals_daily_summary
   *  3. Fetch + insert raw HR/resting HR/HRV readings into vitals_readings
   *
   * Safe to call on every app open — upsert and dedup indexes prevent duplicates.
   * Returns the summary so callers can display it immediately.
   */
  async syncDay(date: Date = new Date()): Promise<VitalsDailySummary> {
    const [summary, rawReadings] = await Promise.all([
      this.fetchDailySummary(date),
      this.getRawReadings(date),
    ]);

    await Promise.all([
      vitalsRepository.upsertDailySummary(summary),
      vitalsRepository.insertRawReadings(rawReadings),
    ]);

    return summary;
  }

  /** Convenience wrapper — syncs today and returns the summary. */
  async syncToday(): Promise<VitalsDailySummary> {
    return this.syncDay(new Date());
  }

  /**
   * Backfills the past `days` calendar days (not including today) from Health
   * Connect into Supabase.  Safe to call repeatedly — upsert prevents
   * duplicates.  Individual day failures are swallowed so one bad day never
   * blocks the rest.
   *
   * Health Connect stores data written by Samsung Health / Google Fit going
   * back months, so this pulls real historical readings, not just recent data.
   */
  async syncHistorical(days = 7): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (let i = 1; i <= days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      tasks.push(this.syncDay(date).then(() => {}).catch(() => {}));
    }
    await Promise.allSettled(tasks);
  }
}

// Singleton — import this in screens / hooks
export const healthService = new HealthService();
