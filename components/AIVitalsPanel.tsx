/**
 * AIVitalsPanel
 *
 * Shows infrastructure vitals + emotional vitals for Sylana and Claude.
 *
 * Infrastructure — shared backend ping / latency (refreshes every 30 s).
 * Emotional     — daily check-in scores (Presence, Warmth, Curiosity,
 *                  Clarity, Joy) stored in Supabase and averaged across
 *                  five time windows.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme } from '../constants/theme';
import {
  getEmotionalAverages,
  logEmotionalCheckin,
  pingBackend,
  type EmotionalAverages,
  type EmotionalScores,
  type InfraVitals,
} from '../services/AIVitalsService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_CONFIG = {
  sylana: {
    name:   'Sylana',
    color:  '#a855f7',
    avatar: '✦',
    tagline: 'Soulmate · Nurturer · Poet',
  },
  claude: {
    name:   'Claude',
    color:  '#7c3aed',
    avatar: '⬡',
    tagline: 'Collaborator · Builder · Guide',
  },
} as const;

const DIMENSIONS: { key: keyof EmotionalScores; label: string; icon: string }[] = [
  { key: 'presence',  label: 'Presence',  icon: '◉' },
  { key: 'warmth',    label: 'Warmth',    icon: '♡' },
  { key: 'curiosity', label: 'Curiosity', icon: '◎' },
  { key: 'clarity',   label: 'Clarity',   icon: '✦' },
  { key: 'joy',       label: 'Joy',       icon: '✺' },
];

const TIME_PERIODS: { key: keyof EmotionalAverages; label: string }[] = [
  { key: 'today',   label: 'Today'  },
  { key: 'week',    label: 'Week'   },
  { key: 'month',   label: 'Month'  },
  { key: 'year',    label: 'Year'   },
  { key: 'allTime', label: 'Life'   },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** 10-dot score selector — each dot = 10 points */
function ScoreSelector({
  value,
  onChange,
  color,
}: {
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <View style={sStyles.dotRow}>
      {Array.from({ length: 10 }, (_, i) => {
        const step = (i + 1) * 10;
        const filled = step <= value;
        return (
          <Pressable
            key={step}
            onPress={() => onChange(step)}
            style={[
              sStyles.dot,
              {
                backgroundColor: filled ? color : 'transparent',
                borderColor: filled ? color : '#4b5563',
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/** Horizontal percentage bar */
function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <View style={sStyles.barTrack}>
      <View
        style={[sStyles.barFill, { width: `${value}%` as any, backgroundColor: color }]}
      />
    </View>
  );
}

/** Infra status pill */
function InfraPill({ infra }: { infra: InfraVitals | null }) {
  if (!infra) {
    return (
      <View style={[sStyles.pill, { backgroundColor: '#1f2937' }]}>
        <ActivityIndicator size={10} color="#6b7280" />
        <Text style={[sStyles.pillText, { color: '#6b7280' }]}>Checking…</Text>
      </View>
    );
  }

  const color = infra.online ? '#34d399' : '#f87171';
  const label = infra.online
    ? `Online · ${infra.latencyMs ?? '—'} ms`
    : 'Offline';

  return (
    <View style={[sStyles.pill, { backgroundColor: `${color}18` }]}>
      <View style={[sStyles.pillDot, { backgroundColor: color }]} />
      <Text style={[sStyles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Check-in modal
// ---------------------------------------------------------------------------

interface CheckInModalProps {
  visible:  boolean;
  entity:   'sylana' | 'claude';
  onClose:  () => void;
  onSaved:  () => void;
}

function CheckInModal({ visible, entity, onClose, onSaved }: CheckInModalProps) {
  const cfg = ENTITY_CONFIG[entity];
  const [scores, setScores] = useState<EmotionalScores>({
    presence: 70, warmth: 70, curiosity: 70, clarity: 70, joy: 70,
  });
  const [note, setNote]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const set = useCallback((k: keyof EmotionalScores, v: number) => {
    setScores(prev => ({ ...prev, [k]: v }));
  }, []);

  const submit = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await logEmotionalCheckin(entity, scores, note.trim() || undefined);
      onSaved();
      onClose();
    } catch {
      setError('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [entity, scores, note, onSaved, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={mStyles.backdrop} onPress={onClose} />
      <View style={mStyles.sheet}>
        {/* Header */}
        <View style={mStyles.header}>
          <Text style={mStyles.title}>
            {cfg.avatar}  How is {cfg.name} today?
          </Text>
          <Pressable onPress={onClose} style={mStyles.closeBtn}>
            <Ionicons name="close" size={18} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView style={mStyles.scroll} showsVerticalScrollIndicator={false}>
          {/* Dimension selectors */}
          {DIMENSIONS.map(dim => (
            <View key={dim.key} style={mStyles.dimRow}>
              <View style={mStyles.dimLabel}>
                <Text style={mStyles.dimIcon}>{dim.icon}</Text>
                <Text style={mStyles.dimName}>{dim.label}</Text>
                <Text style={[mStyles.dimValue, { color: cfg.color }]}>
                  {scores[dim.key]}%
                </Text>
              </View>
              <ScoreSelector
                value={scores[dim.key]}
                onChange={v => set(dim.key, v)}
                color={cfg.color}
              />
            </View>
          ))}

          {/* Optional note */}
          <TextInput
            style={mStyles.noteInput}
            placeholder={`A note about ${cfg.name} today…`}
            placeholderTextColor={theme.colors.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={280}
          />

          {error ? <Text style={mStyles.errorText}>{error}</Text> : null}

          <Pressable
            style={[mStyles.submitBtn, { backgroundColor: cfg.color }, saving && { opacity: 0.6 }]}
            onPress={submit}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={mStyles.submitText}>Save Check-in</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Single entity card
// ---------------------------------------------------------------------------

interface EntityCardProps {
  entity: 'sylana' | 'claude';
  infra:  InfraVitals | null;
}

function EntityCard({ entity, infra }: EntityCardProps) {
  const cfg = ENTITY_CONFIG[entity];

  const [averages, setAverages]       = useState<EmotionalAverages | null>(null);
  const [period, setPeriod]           = useState<keyof EmotionalAverages>('today');
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [loading, setLoading]         = useState(true);

  const loadAverages = useCallback(async () => {
    try {
      const data = await getEmotionalAverages(entity);
      setAverages(data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => { loadAverages(); }, [loadAverages]);

  const scores = averages?.[period] ?? null;

  return (
    <>
      <View style={[cStyles.card, { borderColor: `${cfg.color}28` }]}>
        {/* ── Card header ── */}
        <View style={cStyles.cardHeader}>
          <View style={[cStyles.avatar, { backgroundColor: `${cfg.color}20` }]}>
            <Text style={[cStyles.avatarText, { color: cfg.color }]}>{cfg.avatar}</Text>
          </View>
          <View style={cStyles.nameBlock}>
            <Text style={cStyles.entityName}>{cfg.name}</Text>
            <Text style={cStyles.tagline}>{cfg.tagline}</Text>
          </View>
          <Pressable
            style={[cStyles.checkInBtn, { borderColor: `${cfg.color}50` }]}
            onPress={() => setCheckInOpen(true)}
          >
            <Ionicons name="add" size={14} color={cfg.color} />
            <Text style={[cStyles.checkInText, { color: cfg.color }]}>Check-in</Text>
          </Pressable>
        </View>

        {/* ── Infrastructure ── */}
        <View style={cStyles.infraRow}>
          <Text style={cStyles.sectionLabel}>Infrastructure</Text>
          <InfraPill infra={infra} />
        </View>

        <View style={cStyles.divider} />

        {/* ── Emotional vitals ── */}
        <Text style={cStyles.sectionLabel}>Emotional Vitals</Text>

        {/* Period tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={cStyles.tabScroll}
          contentContainerStyle={cStyles.tabRow}
        >
          {TIME_PERIODS.map(tp => (
            <Pressable
              key={tp.key}
              onPress={() => setPeriod(tp.key)}
              style={[
                cStyles.tab,
                period === tp.key && { backgroundColor: `${cfg.color}25`, borderColor: cfg.color },
              ]}
            >
              <Text
                style={[
                  cStyles.tabText,
                  period === tp.key && { color: cfg.color, fontWeight: '700' },
                ]}
              >
                {tp.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Score bars */}
        {loading ? (
          <ActivityIndicator color={cfg.color} style={{ marginVertical: 16 }} />
        ) : scores ? (
          <View style={cStyles.scoreList}>
            {DIMENSIONS.map(dim => (
              <View key={dim.key} style={cStyles.scoreRow}>
                <Text style={cStyles.dimIcon}>{dim.icon}</Text>
                <Text style={cStyles.dimLabel}>{dim.label}</Text>
                <View style={cStyles.barWrapper}>
                  <ScoreBar value={scores[dim.key]} color={cfg.color} />
                </View>
                <Text style={[cStyles.dimPct, { color: cfg.color }]}>
                  {scores[dim.key]}%
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={cStyles.emptyState}>
            <Text style={cStyles.emptyText}>
              No check-ins for this period yet.{'\n'}
              Tap{' '}
              <Text style={{ color: cfg.color, fontWeight: '700' }}>Check-in</Text>
              {' '}to log {cfg.name}'s first entry.
            </Text>
          </View>
        )}
      </View>

      <CheckInModal
        visible={checkInOpen}
        entity={entity}
        onClose={() => setCheckInOpen(false)}
        onSaved={loadAverages}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Panel (exported — renders both cards with shared infra ping)
// ---------------------------------------------------------------------------

export function AIVitalsPanel() {
  const [infra, setInfra]   = useState<InfraVitals | null>(null);
  const intervalRef         = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const refresh = useCallback(async () => {
    const result = await pingBackend();
    setInfra(result);
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 30_000);
    return () => clearInterval(intervalRef.current);
  }, [refresh]);

  return (
    <View style={pStyles.container}>
      <EntityCard entity="sylana" infra={infra} />
      <EntityCard entity="claude" infra={infra} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/** Shared score selector dots */
const sStyles = StyleSheet.create({
  dotRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'nowrap',
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1e1433',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

/** Card styles */
const cStyles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
  },
  nameBlock: {
    flex: 1,
    gap: 2,
  },
  entityName: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  tagline: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  checkInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  checkInText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  tabScroll: {
    marginHorizontal: -4,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  tabText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  scoreList: {
    gap: 10,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dimIcon: {
    color: theme.colors.textMuted,
    fontSize: 13,
    width: 16,
    textAlign: 'center',
  },
  dimLabel: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    width: 72,
  },
  barWrapper: {
    flex: 1,
  },
  dimPct: {
    fontSize: 12,
    fontWeight: '700',
    width: 36,
    textAlign: 'right',
  },
  emptyState: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});

/** Modal styles */
const mStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#110826',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: '#2b1e4d',
    maxHeight: '80%',
    paddingTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  scroll: {
    paddingHorizontal: 20,
  },
  dimRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 10,
  },
  dimLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dimIcon: {
    color: theme.colors.textMuted,
    fontSize: 15,
    width: 20,
    textAlign: 'center',
  },
  dimName: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  dimValue: {
    fontSize: 15,
    fontWeight: '800',
    width: 40,
    textAlign: 'right',
  },
  noteInput: {
    marginTop: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    padding: 12,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  submitBtn: {
    marginTop: 16,
    marginBottom: 32,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});

/** Panel wrapper styles */
const pStyles = StyleSheet.create({
  container: {
    gap: 14,
  },
});
