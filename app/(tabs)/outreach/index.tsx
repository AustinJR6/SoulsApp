import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '../../../constants/theme';
import { outreachService } from '../../../services/OutreachService';
import type { DashboardPayload, OutreachSession, SessionStatus } from '../../../types/outreach';

function formatDateTime(iso: string | null): string {
  if (!iso) return 'In progress';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function sessionColor(status: SessionStatus): string {
  if (status === 'running') return '#3B82F6';
  if (status === 'failed') return '#EF4444';
  return '#22C55E';
}

const defaultPayload: DashboardPayload = {
  summary: {
    draftsAwaitingApproval: 0,
    prospectsFoundThisWeek: 0,
    emailsApprovedThisWeek: 0,
    sessionsRunThisWeek: 0,
  },
  recentSessions: [],
};

export default function OutreachDashboardScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DashboardPayload>(defaultPayload);
  const [runningWorkflow, setRunningWorkflow] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [dashboard, recentSessions] = await Promise.all([
        outreachService.getDashboard(),
        outreachService.getRecentSessions(5),
      ]);
      setPayload({ ...dashboard, recentSessions: recentSessions.length ? recentSessions : dashboard.recentSessions });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load outreach dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const cards = useMemo(
    () => [
      {
        key: 'drafts',
        title: 'Drafts Awaiting Approval',
        value: payload.summary.draftsAwaitingApproval,
        icon: 'mail-open-outline' as const,
        onPress: () => router.push('/(tabs)/outreach/queue'),
      },
      {
        key: 'prospects',
        title: 'Prospects Found This Week',
        value: payload.summary.prospectsFoundThisWeek,
        icon: 'people-outline' as const,
        onPress: () => router.push('/(tabs)/outreach/prospects'),
      },
      {
        key: 'approved',
        title: 'Emails Approved This Week',
        value: payload.summary.emailsApprovedThisWeek,
        icon: 'checkmark-circle-outline' as const,
      },
      {
        key: 'sessions',
        title: 'Sessions Run This Week',
        value: payload.summary.sessionsRunThisWeek,
        icon: 'sparkles-outline' as const,
      },
    ],
    [payload.summary, router]
  );

  const runManifestWorkflow = useCallback(async () => {
    setRunningWorkflow(true);
    try {
      const result = await outreachService.runProspectResearch(2, 'manifest', 'claude');
      const sessionId =
        (result?.session_id as string | undefined) ??
        (result?.sessionId as string | undefined) ??
        '';
      await load();
      if (sessionId) {
        router.push(`/(tabs)/outreach/session/${sessionId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start outreach workflow.');
    } finally {
      setRunningWorkflow(false);
    }
  }, [load, router]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.accent} />}
    >
      <Text style={styles.title}>Outreach</Text>
      <Text style={styles.subtitle}>Review and approve AI prospecting drafts for Manifest.</Text>
      <Pressable
        style={({ pressed }) => [styles.runWorkflowBtn, pressed && styles.runWorkflowBtnPressed, runningWorkflow && styles.runWorkflowBtnDisabled]}
        onPress={runManifestWorkflow}
        disabled={runningWorkflow}
      >
        <Ionicons name="rocket-outline" size={17} color="#ECFDF5" />
        <Text style={styles.runWorkflowBtnText}>
          {runningWorkflow ? 'Starting workflow...' : 'Run Manifest Workflow (2 prospects)'}
        </Text>
      </Pressable>
      <View style={styles.workflowDocCard}>
        <Text style={styles.workflowDocTitle}>Workflow Path</Text>
        <Text style={styles.workflowDocText}>1. Run workflow</Text>
        <Text style={styles.workflowDocText}>2. Review queue at Outreach {'>'} Draft Approval Queue</Text>
        <Text style={styles.workflowDocText}>3. Approve/reject draft</Text>
        <Text style={styles.workflowDocText}>4. Send draft and track opens/clicks</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.cardGrid}>
        {cards.map((card) => (
          <Pressable
            key={card.key}
            style={({ pressed }) => [styles.summaryCard, pressed && styles.summaryCardPressed]}
            onPress={card.onPress}
            disabled={!card.onPress}
          >
            <View style={styles.cardIconWrap}>
              <Ionicons name={card.icon} size={18} color={theme.colors.accent} />
            </View>
            <Text style={styles.cardValue}>{card.value}</Text>
            <Text style={styles.cardTitle}>{card.title}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Sessions</Text>
      </View>

      {payload.recentSessions.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No sessions yet</Text>
          <Text style={styles.emptyText}>When outreach runs, the last 5 sessions will appear here.</Text>
        </View>
      ) : (
        payload.recentSessions.map((session: OutreachSession) => (
          <Pressable
            key={session.id}
            style={({ pressed }) => [styles.sessionCard, pressed && styles.sessionCardPressed]}
            onPress={() => router.push(`/(tabs)/outreach/session/${session.id}`)}
          >
            <View style={styles.sessionTopRow}>
              <View style={[styles.statusDot, { backgroundColor: sessionColor(session.status) }]} />
              <Text style={styles.sessionStatus}>{session.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.sessionGoal}>{session.goal}</Text>
            <Text style={styles.sessionSummary}>{session.completionSummary || session.summary || 'No completion summary yet.'}</Text>
            <Text style={styles.sessionTime}>{formatDateTime(session.endedAt ?? session.startedAt)}</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 14,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  loadingWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7F1D1D',
    backgroundColor: '#2A0E17',
    padding: 12,
    gap: 10,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryText: {
    color: '#FEE2E2',
    fontWeight: '700',
    fontSize: 12,
  },
  runWorkflowBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1D4ED8',
    backgroundColor: '#2563EB',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  runWorkflowBtnPressed: {
    opacity: 0.9,
  },
  runWorkflowBtnDisabled: {
    opacity: 0.7,
  },
  runWorkflowBtnText: {
    color: '#ECFDF5',
    fontSize: 14,
    fontWeight: '800',
  },
  workflowDocCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
    gap: 4,
  },
  workflowDocTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  workflowDocText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '48.5%',
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    gap: 6,
  },
  summaryCardPressed: {
    opacity: 0.85,
  },
  cardIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceElevated,
  },
  cardValue: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  cardTitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeader: {
    marginTop: 4,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
    gap: 8,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  sessionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 13,
    gap: 8,
  },
  sessionCardPressed: {
    opacity: 0.85,
  },
  sessionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 99,
  },
  sessionStatus: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  sessionGoal: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  sessionSummary: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  sessionTime: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
});
