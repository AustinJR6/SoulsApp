/**
 * useVitals
 *
 * Manages the full Health Connect → Supabase pipeline for the Vitals screen.
 *
 * Lifecycle:
 *   idle → initializing → needs_permission | syncing → ready | error
 *
 * Design notes:
 * • Health Connect data is always fetched and displayed even if Supabase is
 *   unavailable (user may not be authenticated yet).
 * • Supabase sync is best-effort; failures are logged but don't block the UI.
 * • Alert engine runs after each successful sync.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { alertEngine } from '../services/AlertEngine';
import { healthService } from '../services/HealthService';
import { supabase } from '../services/supabase';
import { vitalsRepository } from '../services/VitalsRepository';
import type { PermissionStatus, VitalsAlert, VitalsDailySummary } from '../types/health';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VitalsStatus =
  | 'idle'
  | 'initializing'
  | 'needs_permission'
  | 'syncing'
  | 'ready'
  | 'unavailable'
  | 'error';

export interface VitalsState {
  status: VitalsStatus;
  today: VitalsDailySummary | null;
  /** Last 7 days including today, newest first */
  week: VitalsDailySummary[];
  alerts: VitalsAlert[];
  permissions: PermissionStatus | null;
  errorMessage: string | null;
  lastSyncedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVitals() {
  const [state, setState] = useState<VitalsState>({
    status: 'idle',
    today: null,
    week: [],
    alerts: [],
    permissions: null,
    errorMessage: null,
    lastSyncedAt: null,
  });

  const initialized = useRef(false);

  const patch = (update: Partial<VitalsState>) =>
    setState((prev) => ({ ...prev, ...update }));

  // -------------------------------------------------------------------------
  // Sync: fetch HC data + (best-effort) push to Supabase + run alerts
  // -------------------------------------------------------------------------

  const sync = useCallback(async () => {
    patch({ status: 'syncing', errorMessage: null });

    try {
      // Always fetch from Health Connect
      const today = await healthService.fetchDailySummary(new Date());

      // Best-effort Supabase operations
      let week: VitalsDailySummary[] = [];
      let activeAlerts: VitalsAlert[] = [];

      try {
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id;

        if (userId) {
          // Persist today's summary + raw readings
          const raw = await healthService.getRawReadings(new Date());
          await Promise.all([
            vitalsRepository.upsertDailySummary(today),
            vitalsRepository.insertRawReadings(raw),
          ]);

          // Load 7-day history
          week = await vitalsRepository.getRecentSummaries(7);

          // Run alert engine
          await alertEngine.checkAndAlert(userId, today);
          activeAlerts = await vitalsRepository.getActiveAlerts();
        } else {
          // No auth — show only today's local data
          week = [today];
        }
      } catch (supabaseErr) {
        console.warn('[useVitals] Supabase sync failed (showing local data):', supabaseErr);
        week = [today];
      }

      patch({
        status: 'ready',
        today,
        week,
        alerts: activeAlerts,
        lastSyncedAt: new Date(),
      });
    } catch (err) {
      console.warn('[useVitals] Health Connect fetch failed:', err);
      patch({
        status: 'error',
        errorMessage: 'Failed to read health data. Pull down to retry.',
      });
    }
  }, []);

  // -------------------------------------------------------------------------
  // Request permissions → then sync
  // -------------------------------------------------------------------------

  const requestPermissions = useCallback(async () => {
    const perms = await healthService.requestPermissions();
    patch({ permissions: perms });

    if (perms.allGranted) {
      // Backfill the past 7 days from Health Connect into Supabase in the
      // background — doesn't block the immediate sync or the UI.
      healthService.syncHistorical(7).catch(() => {});
      await sync();
    } else {
      patch({ status: 'needs_permission' });
    }
  }, [sync]);

  // -------------------------------------------------------------------------
  // Initialize on mount
  // -------------------------------------------------------------------------

  const initialize = useCallback(async () => {
    if (initialized.current) return;
    initialized.current = true;

    patch({ status: 'initializing' });

    const available = await healthService.initialize();
    if (!available) {
      patch({ status: 'unavailable', errorMessage: 'Health Connect is not installed on this device.' });
      return;
    }

    const perms = await healthService.checkPermissions();
    patch({ permissions: perms });

    if (!perms.allGranted) {
      patch({ status: 'needs_permission' });
      return;
    }

    // Backfill historical data in the background on every cold start.
    // syncHistorical uses upsert so repeated calls are safe/idempotent.
    healthService.syncHistorical(7).catch(() => {});

    await sync();
  }, [sync]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return { ...state, requestPermissions, sync };
}
