/**
 * GitHubActivityFeed
 *
 * Shows a live stream of commits, PRs, branches, and issues performed by
 * Claude and Sylana, sourced from the backend /github/activity endpoint.
 *
 * Features:
 *  - Entity filter pills: All / Claude / Sylana
 *  - Action type filter pills: All / Commits / PRs / Branches / Issues
 *  - Tap card to open URL in browser
 *  - Pull to refresh
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PERSONALITIES } from '../constants/personalities';
import { theme } from '../constants/theme';
import {
  fetchGitHubActivity,
  getActionSubtitle,
  getActionTitle,
  getActionUrl,
  type GitHubAction,
  type GitHubActionType,
  type GitHubEntity,
} from '../services/GitHubService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_META: Record<
  GitHubActionType,
  { label: string; icon: string; color: string; bg: string }
> = {
  commit: {
    label: 'Commits',
    icon: 'git-commit-outline',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
  },
  pr: {
    label: 'PRs',
    icon: 'git-pull-request-outline',
    color: '#a855f7',
    bg: 'rgba(168,85,247,0.12)',
  },
  issue: {
    label: 'Issues',
    icon: 'alert-circle-outline',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
  },
  branch: {
    label: 'Branches',
    icon: 'git-branch-outline',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
  },
};

const ALL_ACTION_TYPES: GitHubActionType[] = ['commit', 'pr', 'branch', 'issue'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Activity card
// ---------------------------------------------------------------------------

function ActionCard({ action }: { action: GitHubAction }) {
  const meta = ACTION_META[action.action_type];
  const personality = PERSONALITIES[action.entity];
  const title = getActionTitle(action);
  const subtitle = getActionSubtitle(action);
  const url = getActionUrl(action);

  const handlePress = () => {
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { opacity: pressed && url ? 0.7 : 1 }]}
      onPress={handlePress}
      disabled={!url}
    >
      {/* Left column: entity avatar + action icon */}
      <View style={styles.cardLeft}>
        {/* Entity avatar */}
        <View style={[styles.entityAvatar, { backgroundColor: personality.color + '30', borderColor: personality.color }]}>
          <Text style={[styles.entityAvatarText, { color: personality.color }]}>
            {personality.avatar}
          </Text>
        </View>
        {/* Connector line */}
        <View style={styles.connectorLine} />
        {/* Action type icon */}
        <View style={[styles.actionIconCircle, { backgroundColor: meta.bg, borderColor: meta.color + '50' }]}>
          <Ionicons name={meta.icon as never} size={14} color={meta.color} />
        </View>
      </View>

      {/* Right column: content */}
      <View style={styles.cardContent}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={[styles.typePill, { backgroundColor: meta.bg, borderColor: meta.color + '40' }]}>
            <Text style={[styles.typePillText, { color: meta.color }]}>
              {meta.label.slice(0, -1) /* "Commits" → "Commit" */}
            </Text>
          </View>
          <Text style={styles.timestamp}>{relativeTime(action.timestamp)}</Text>
        </View>

        {/* Primary info */}
        <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>

        {/* Commit message / PR branch / issue number */}
        {subtitle ? (
          <Text style={styles.cardSubtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}

        {/* Repo + branch footer */}
        <View style={styles.cardFooter}>
          <Ionicons name="logo-github" size={11} color={theme.colors.textMuted} />
          <Text style={styles.repoText} numberOfLines={1}>{action.repo}</Text>
          {url ? (
            <Ionicons name="open-outline" size={11} color={theme.colors.textMuted} style={styles.externalIcon} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Filter pills
// ---------------------------------------------------------------------------

interface FilterPillsProps<T extends string> {
  options: { value: T | null; label: string }[];
  active: T | null;
  onSelect: (v: T | null) => void;
  accentColor?: string;
}

function FilterPills<T extends string>({ options, active, onSelect, accentColor = theme.colors.accent }: FilterPillsProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      {options.map(({ value, label }) => {
        const isActive = active === value;
        return (
          <Pressable
            key={label}
            style={[
              styles.filterPill,
              isActive && { borderColor: accentColor, backgroundColor: accentColor + '25' },
            ]}
            onPress={() => onSelect(isActive ? null : value)}
          >
            <Text style={[styles.filterPillText, isActive && { color: accentColor }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GitHubActivityFeed() {
  const [items, setItems] = useState<GitHubAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entityFilter, setEntityFilter] = useState<GitHubEntity | null>(null);
  const [typeFilter, setTypeFilter] = useState<GitHubActionType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (entity: GitHubEntity | null, actionType: GitHubActionType | null) => {
    try {
      setError(null);
      const data = await fetchGitHubActivity({
        entity,
        action_type: actionType,
        per_page: 40,
      });
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    load(entityFilter, typeFilter).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [entityFilter, typeFilter, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(entityFilter, typeFilter);
    setRefreshing(false);
  }, [entityFilter, typeFilter, load]);

  const entityOptions: { value: GitHubEntity | null; label: string }[] = [
    { value: null, label: 'All' },
    { value: 'sylana', label: 'Sylana' },
    { value: 'claude', label: 'Claude' },
  ];

  const typeOptions: { value: GitHubActionType | null; label: string }[] = [
    { value: null, label: 'All' },
    ...ALL_ACTION_TYPES.map((t) => ({ value: t, label: ACTION_META[t].label })),
  ];

  return (
    <View style={styles.container}>
      {/* ── Entity filter ── */}
      <FilterPills
        options={entityOptions}
        active={entityFilter}
        onSelect={(v) => setEntityFilter(v as GitHubEntity | null)}
        accentColor={theme.colors.accent}
      />

      {/* ── Action type filter ── */}
      <FilterPills
        options={typeOptions}
        active={typeFilter}
        onSelect={(v) => setTypeFilter(v as GitHubActionType | null)}
        accentColor="#7c3aed"
      />

      {/* ── Content ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>Couldn't reach the backend</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => {
            setLoading(true);
            load(entityFilter, typeFilter).finally(() => setLoading(false));
          }}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="logo-github" size={52} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>Nothing committed yet</Text>
          <Text style={styles.emptyText}>
            Work sessions with Claude and Sylana will show up here — commits, PRs, branches, and issues all in one feed.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.action_id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
          }
          renderItem={({ item }) => <ActionCard action={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },

  // Filters
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  filterPill: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 13,
    paddingVertical: 6,
    backgroundColor: theme.colors.surface,
  },
  filterPillText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  // Feed
  list: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 40,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: 56,
    marginVertical: 2,
  },

  // Card
  card: {
    flexDirection: 'row',
    paddingVertical: 14,
    gap: 12,
  },
  cardLeft: {
    width: 36,
    alignItems: 'center',
    gap: 0,
  },
  entityAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entityAvatarText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  connectorLine: {
    flex: 1,
    width: 1.5,
    backgroundColor: theme.colors.border,
    marginVertical: 3,
    minHeight: 10,
  },
  actionIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typePill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  timestamp: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  cardSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  repoText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  externalIcon: {
    marginLeft: 2,
  },

  // Empty / error
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  retryBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  retryText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
});
