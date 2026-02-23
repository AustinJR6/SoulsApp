import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '../../../../constants/theme';
import { outreachService } from '../../../../services/OutreachService';
import type { OutreachSessionDetail, OutreachSessionTask } from '../../../../types/outreach';

function sessionColor(status: string): string {
  if (status === 'running') return '#3B82F6';
  if (status === 'failed') return '#EF4444';
  return '#22C55E';
}

function taskColor(status: string): string {
  if (status === 'failed') return '#EF4444';
  if (status === 'running') return '#3B82F6';
  return '#22C55E';
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'In progress';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function SessionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const sessionId = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id) ?? '', [params.id]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<OutreachSessionDetail | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const data = await outreachService.getSessionById(sessionId);
        if (mounted) {
          setSession(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load session detail.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (!sessionId) {
      setError('Missing session ID.');
      setLoading(false);
      return;
    }

    load();

    return () => {
      mounted = false;
    };
  }, [sessionId]);

  const toggleTask = (task: OutreachSessionTask) => {
    setExpanded((prev) => ({ ...prev, [task.id]: !prev[task.id] }));
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Session Detail</Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.centerText}>Loading session...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && session ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: sessionColor(session.status) }]} />
              <Text style={styles.statusText}>{session.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.goal}>{session.goal}</Text>
            <Text style={styles.summary}>{session.summary || 'No summary provided.'}</Text>
            <Text style={styles.meta}>Start: {formatDateTime(session.startedAt)}</Text>
            <Text style={styles.meta}>End: {formatDateTime(session.endedAt)}</Text>
          </View>

          <Text style={styles.sectionTitle}>Tasks</Text>

          {session.tasks.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.summary}>No task breakdown available.</Text>
            </View>
          ) : (
            session.tasks.map((task) => {
              const isOpen = Boolean(expanded[task.id]);
              return (
                <Pressable key={task.id} style={styles.taskCard} onPress={() => toggleTask(task)}>
                  <View style={styles.taskTop}>
                    <View style={[styles.taskDot, { backgroundColor: taskColor(task.status) }]} />
                    <Text style={styles.taskType}>{task.taskType}</Text>
                    <Text style={styles.taskStatus}>{task.status}</Text>
                  </View>
                  <Text style={styles.taskSummary}>{task.outputSummary || 'No output summary provided.'}</Text>
                  <View style={styles.expandRow}>
                    <Text style={styles.expandText}>{isOpen ? 'Hide full output' : 'Show full output'}</Text>
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={theme.colors.textMuted} />
                  </View>
                  {isOpen ? <Text style={styles.fullOutput}>{task.fullOutput || 'No output content available.'}</Text> : null}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  centerState: {
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 15,
    alignItems: 'center',
    gap: 10,
  },
  centerText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 14,
    gap: 10,
    paddingBottom: 28,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 13,
    gap: 7,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 99,
  },
  statusText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  goal: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  summary: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  taskCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
    gap: 8,
  },
  taskTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
  },
  taskType: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  taskStatus: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  taskSummary: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  fullOutput: {
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
    fontSize: 12,
    lineHeight: 18,
  },
});
