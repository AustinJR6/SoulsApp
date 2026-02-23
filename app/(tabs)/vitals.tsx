/**
 * Vitals Screen — Phase 4
 *
 * Displays today's Health Connect metrics + 7-day sparkline trends.
 * Uses pure React Native views for charts (no extra native dependencies).
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AIVitalsPanel } from '../../components/AIVitalsPanel';
import { SleepStageBreakdown } from '../../components/SleepStageBreakdown';
import { theme } from '../../constants/theme';
import { useVitals } from '../../hooks/useVitals';
import type { VitalsDailySummary, VitalsAlert } from '../../types/health';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmt(value: number | null, decimals = 0): string {
  if (value === null) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sparkline (pure View bars)
// ---------------------------------------------------------------------------

interface SparklineProps {
  data: (number | null)[];
  color: string;
  height?: number;
}

function Sparkline({ data, color, height = 40 }: SparklineProps) {
  const valid = data.filter((v): v is number => v !== null);
  if (valid.length < 2) {
    return <View style={{ height, justifyContent: 'center' }}><Text style={styles.sparkEmpty}>Not enough data</Text></View>;
  }

  const max = Math.max(...valid);
  const min = Math.min(...valid);
  const range = max - min || 1;

  return (
    <View style={[styles.sparkContainer, { height }]}>
      {data.map((v, i) => {
        const ratio = v !== null ? (v - min) / range : 0;
        const barH = Math.max(4, Math.round(ratio * (height - 6)));
        return (
          <View key={i} style={styles.sparkBarWrapper}>
            <View
              style={[
                styles.sparkBar,
                {
                  height: barH,
                  backgroundColor: v !== null ? color : theme.colors.border,
                  opacity: v !== null ? 0.85 + ratio * 0.15 : 0.3,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

interface MetricCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  primary: string;
  secondary?: string;
  color: string;
  trend?: string;
}

function MetricCard({ icon, label, primary, secondary, color, trend }: MetricCardProps) {
  return (
    <View style={[styles.card, { borderColor: `${color}30` }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconBadge, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        {trend ? <Text style={[styles.trend, { color }]}>{trend}</Text> : null}
      </View>
      <Text style={styles.cardPrimary}>{primary}</Text>
      {secondary ? <Text style={styles.cardSecondary}>{secondary}</Text> : null}
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Alert banner
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  info: '#60a5fa',
  warning: '#f59e0b',
  critical: '#ef4444',
};

const METRIC_LABELS: Record<string, string> = {
  heart_rate: 'Heart Rate',
  resting_heart_rate: 'Resting HR',
  hrv: 'HRV',
  steps: 'Steps',
  sleep_score: 'Sleep Score',
};

function AlertBanner({ alert }: { alert: VitalsAlert }) {
  const color = SEVERITY_COLORS[alert.severity] ?? '#60a5fa';
  const direction = alert.alertType === 'high' ? 'above' : 'below';
  const metric = METRIC_LABELS[alert.metric] ?? alert.metric;

  return (
    <View style={[styles.alertBanner, { borderLeftColor: color, backgroundColor: `${color}15` }]}>
      <Ionicons name="warning-outline" size={16} color={color} />
      <Text style={[styles.alertText, { color }]}>
        {metric} is {direction} your baseline ({fmt(alert.baseline)} avg → {fmt(alert.value)} today)
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 7-day trend section
// ---------------------------------------------------------------------------

interface TrendRowProps {
  label: string;
  color: string;
  data: (number | null)[];
  unit: string;
}

function TrendRow({ label, color, data, unit }: TrendRowProps) {
  const valid = data.filter((v): v is number => v !== null);
  const latest = valid.at(-1) ?? null;
  return (
    <View style={styles.trendRow}>
      <View style={styles.trendMeta}>
        <Text style={styles.trendLabel}>{label}</Text>
        <Text style={[styles.trendValue, { color }]}>
          {latest !== null ? `${fmt(latest)} ${unit}` : '—'}
        </Text>
      </View>
      <Sparkline data={data} color={color} height={36} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Permission prompt
// ---------------------------------------------------------------------------

function PermissionPrompt({ onRequest }: { onRequest: () => void }) {
  return (
    <View style={styles.centerContent}>
      <View style={[styles.iconBadge, { backgroundColor: `${theme.colors.accent}20`, width: 64, height: 64, borderRadius: 32 }]}>
        <Ionicons name="heart-circle-outline" size={36} color={theme.colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>Connect Health Data</Text>
      <Text style={styles.emptySubtitle}>
        Vessel reads your Galaxy Watch metrics from Health Connect to track your wellbeing over time.
      </Text>
      <Pressable style={styles.permissionBtn} onPress={onRequest}>
        <Text style={styles.permissionBtnText}>Grant Health Permissions</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function VitalsScreen() {
  const insets = useSafeAreaInsets();
  const { status, today, week, alerts, errorMessage, lastSyncedAt, requestPermissions, sync } = useVitals();

  const isRefreshing = status === 'syncing';

  // Build 7-day arrays (oldest → newest) for sparklines
  const sortedWeek = useMemo(
    () => [...week].sort((a, b) => a.date.localeCompare(b.date)),
    [week]
  );

  function weekSeries(key: keyof VitalsDailySummary): (number | null)[] {
    return sortedWeek.map((d) => d[key] as number | null);
  }

  // -----------------------------------------------------------------------
  // Loading / unavailable / permission states
  // -----------------------------------------------------------------------

  if (status === 'initializing' || status === 'idle') {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>Connecting to Health Connect…</Text>
      </View>
    );
  }

  if (status === 'unavailable') {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.danger} />
        <Text style={styles.emptyTitle}>Health Connect Unavailable</Text>
        <Text style={styles.emptySubtitle}>
          Install Health Connect from the Play Store, then reopen Vessel.
        </Text>
      </View>
    );
  }

  if (status === 'needs_permission') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={[styles.pageTitle, { paddingHorizontal: 20, paddingTop: 16 }]}>Vitals</Text>
        <PermissionPrompt onRequest={requestPermissions} />
      </View>
    );
  }

  // -----------------------------------------------------------------------
  // Main dashboard
  // -----------------------------------------------------------------------

  const hr = today?.avgHr;
  const restHr = today?.restingHr;
  const hrv = today?.hrv;
  const steps = today?.steps;
  const cal = today?.caloriesActive;
  const sleepMin = today?.sleepDurationMinutes;
  const sleepScore = today?.sleepScore;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Glow orbs matching the rest of the app */}
      <View style={[styles.glowOrb, styles.glowTop]} />
      <View style={[styles.glowOrb, styles.glowBottom]} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Vitals</Text>
        <Pressable
          style={styles.syncBtn}
          onPress={sync}
          disabled={isRefreshing}
        >
          {isRefreshing
            ? <ActivityIndicator size="small" color={theme.colors.accent} />
            : <Ionicons name="refresh" size={18} color={theme.colors.accent} />}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={sync}
            tintColor={theme.colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Date */}
        <Text style={styles.dateLabel}>{todayLabel()}</Text>

        {/* Error message */}
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={14} color={theme.colors.danger} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* Alert banners */}
        {alerts.map((a, i) => <AlertBanner key={i} alert={a} />)}

        {/* ── Today's metric cards ── */}
        <Text style={styles.sectionTitle}>Today</Text>

        <View style={styles.cardGrid}>
          <MetricCard
            icon="heart"
            label="Heart Rate"
            primary={hr !== null && hr !== undefined ? `${hr} bpm` : '—'}
            secondary={restHr !== null && restHr !== undefined ? `Resting: ${restHr} bpm` : undefined}
            color="#f87171"
          />
          <MetricCard
            icon="moon"
            label="Sleep"
            primary={formatMinutes(sleepMin ?? null)}
            secondary={sleepScore !== null && sleepScore !== undefined ? `Score: ${sleepScore}/100` : undefined}
            color="#818cf8"
          />
          <MetricCard
            icon="footsteps"
            label="Steps"
            primary={fmt(steps ?? null)}
            secondary={cal !== null && cal !== undefined ? `${fmt(cal)} kcal` : undefined}
            color="#34d399"
          />
          <MetricCard
            icon="pulse"
            label="HRV"
            primary={hrv !== null && hrv !== undefined ? `${hrv} ms` : '—'}
            color="#fb923c"
          />
        </View>

        {/* ── Sleep stage breakdown ── */}
        {today?.sleepStages && today.sleepStages.length > 0 && (
          <SleepStageBreakdown
            stages={today.sleepStages}
            totalMinutes={today.sleepDurationMinutes}
          />
        )}

        {/* ── 7-Day Trends ── */}
        {sortedWeek.length >= 2 ? (
          <>
            <Text style={styles.sectionTitle}>7-Day Trends</Text>
            <View style={styles.trendsCard}>
              <TrendRow
                label="Heart Rate"
                color="#f87171"
                data={weekSeries('avgHr')}
                unit="bpm"
              />
              <View style={styles.trendDivider} />
              <TrendRow
                label="Sleep"
                color="#818cf8"
                data={weekSeries('sleepDurationMinutes')}
                unit="min"
              />
              <View style={styles.trendDivider} />
              <TrendRow
                label="Steps"
                color="#34d399"
                data={weekSeries('steps')}
                unit="steps"
              />
              <View style={styles.trendDivider} />
              <TrendRow
                label="HRV"
                color="#fb923c"
                data={weekSeries('hrv')}
                unit="ms"
              />
            </View>
          </>
        ) : null}

        {/* ── AI Vitals ── */}
        <Text style={styles.sectionTitle}>AI Vitals</Text>
        <AIVitalsPanel />

        {/* Last synced */}
        {lastSyncedAt ? (
          <Text style={styles.syncedAt}>
            Synced {lastSyncedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CARD_GAP = 12;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  glowOrb: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: theme.colors.accent,
    opacity: 0.08,
  },
  glowTop: {
    top: -100,
    right: -60,
  },
  glowBottom: {
    bottom: -110,
    left: -70,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  pageTitle: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
  },
  syncBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },

  dateLabel: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },

  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 4,
  },

  // Metric cards
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  card: {
    width: `${50 - (CARD_GAP / 4)}%`,
    flexGrow: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trend: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardPrimary: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  cardSecondary: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  cardLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // Sparkline
  sparkContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    flex: 1,
  },
  sparkBarWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sparkBar: {
    width: '100%',
    borderRadius: 3,
    minHeight: 4,
  },
  sparkEmpty: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },

  // Trend rows
  trendsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
  },
  trendRow: {
    gap: 8,
  },
  trendMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trendLabel: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  trendValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  trendDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },

  // Alerts
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 2,
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${theme.colors.danger}15`,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    flex: 1,
  },

  // Permission
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  permissionBtn: {
    backgroundColor: theme.colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  // Loading
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
  },

  // Synced
  syncedAt: {
    color: theme.colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
});
