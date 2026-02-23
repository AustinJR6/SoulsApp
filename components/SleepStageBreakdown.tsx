/**
 * SleepStageBreakdown
 *
 * Displays a segmented bar + per-stage legend for a single night's sleep.
 * Color-coded by stage type; proportional widths derived from duration.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../constants/theme';
import type { SleepStage, SleepStageType } from '../types/health';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<SleepStageType, string> = {
  deep:       '#1d4ed8',   // dark blue
  rem:        '#7c3aed',   // purple
  light:      '#60a5fa',   // light blue
  sleeping:   '#3b82f6',   // medium blue (generic)
  awake:      '#f97316',   // orange
  out_of_bed: '#6b7280',   // gray
  unknown:    '#374151',   // dark gray
};

const STAGE_LABELS: Record<SleepStageType, string> = {
  deep:       'Deep',
  rem:        'REM',
  light:      'Light',
  sleeping:   'Sleep',
  awake:      'Awake',
  out_of_bed: 'Out of Bed',
  unknown:    'Other',
};

// Stages to render (and their display order — most meaningful first)
const STAGE_ORDER: SleepStageType[] = ['deep', 'rem', 'light', 'sleeping', 'awake', 'out_of_bed', 'unknown'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMins(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  stages: SleepStage[];
  totalMinutes?: number | null;
}

export function SleepStageBreakdown({ stages, totalMinutes }: Props) {
  // Aggregate durations per stage type
  const stageTotals = useMemo(() => {
    return stages.reduce<Partial<Record<SleepStageType, number>>>((acc, s) => {
      acc[s.stage] = (acc[s.stage] ?? 0) + s.durationMinutes;
      return acc;
    }, {});
  }, [stages]);

  const totalFromStages = Object.values(stageTotals).reduce<number>((s, v) => s + (v ?? 0), 0);
  const total = totalFromStages || totalMinutes || 1;

  const presentStages = STAGE_ORDER.filter(s => (stageTotals[s] ?? 0) > 0);

  if (presentStages.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Sleep Breakdown</Text>

      {/* ── Segmented bar ── */}
      <View style={styles.bar}>
        {presentStages.map((stage, idx) => {
          const mins = stageTotals[stage] ?? 0;
          const pct = (mins / total) * 100;
          return (
            <View
              key={stage}
              style={[
                styles.barSegment,
                {
                  flexGrow: pct,
                  backgroundColor: STAGE_COLORS[stage],
                  borderTopLeftRadius:  idx === 0                       ? 6 : 0,
                  borderBottomLeftRadius: idx === 0                     ? 6 : 0,
                  borderTopRightRadius:  idx === presentStages.length - 1 ? 6 : 0,
                  borderBottomRightRadius: idx === presentStages.length - 1 ? 6 : 0,
                },
              ]}
            />
          );
        })}
      </View>

      {/* ── Legend ── */}
      <View style={styles.legend}>
        {presentStages.map(stage => {
          const mins = stageTotals[stage] ?? 0;
          const pct = Math.round((mins / total) * 100);
          return (
            <View key={stage} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: STAGE_COLORS[stage] }]} />
              <Text style={styles.legendLabel}>{STAGE_LABELS[stage]}</Text>
              <Text style={styles.legendTime}>{formatMins(mins)}</Text>
              <Text style={styles.legendPct}>{pct}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#818cf830',
    padding: 16,
    gap: 14,
  },
  heading: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  bar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    gap: 2,
  },
  barSegment: {
    height: '100%',
  },
  legend: {
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  legendTime: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    minWidth: 60,
    textAlign: 'right',
  },
  legendPct: {
    color: theme.colors.textMuted,
    fontSize: 12,
    minWidth: 36,
    textAlign: 'right',
  },
});
