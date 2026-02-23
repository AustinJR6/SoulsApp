import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
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
import type { EmailDraft } from '../../../types/outreach';

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function firstLine(value: string): string {
  if (!value.trim()) return 'No body preview available.';
  return value.split('\n').find((line) => line.trim())?.trim() ?? 'No body preview available.';
}

export default function DraftApprovalQueueScreen() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await outreachService.getDraftQueue();
      setDrafts(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load draft queue.');
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

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Draft Approval Queue</Text>
          <Text style={styles.subtitle}>{drafts.length} drafts pending review</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.accent} />}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.loadingText}>Loading drafts...</Text>
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

        {!loading && !error && drafts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No pending drafts</Text>
            <Text style={styles.emptyText}>When AI creates new email drafts, they will show up here.</Text>
          </View>
        ) : null}

        {drafts.map((draft) => (
          <Pressable
            key={draft.id}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => router.push(`/(tabs)/outreach/draft/${draft.id}`)}
          >
            <View style={styles.cardTopRow}>
              <Text style={styles.company}>{draft.companyName}</Text>
              <View style={styles.modelBadge}>
                <Text style={styles.modelBadgeText}>{draft.aiModel.toUpperCase()}</Text>
              </View>
            </View>

            <Text style={styles.contact}>{draft.contactName}{draft.contactTitle ? ` · ${draft.contactTitle}` : ''}</Text>
            <Text style={styles.subject}>Subject: {draft.subject || '(No subject)'}</Text>
            <Text style={styles.preview}>{firstLine(draft.body)}</Text>
            <Text style={styles.time}>{formatTime(draft.draftedAt)}</Text>
          </Pressable>
        ))}
      </ScrollView>
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
    paddingBottom: 8,
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
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 14,
    gap: 10,
    paddingBottom: 30,
  },
  loadingWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
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
    borderRadius: 8,
    backgroundColor: '#7F1D1D',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryText: {
    color: '#FEE2E2',
    fontSize: 12,
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
    lineHeight: 19,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 13,
    gap: 7,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  company: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  modelBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modelBadgeText: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  contact: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  subject: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  preview: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  time: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
});
