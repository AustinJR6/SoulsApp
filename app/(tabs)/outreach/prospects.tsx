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
import type { OutreachStatus, Prospect } from '../../../types/outreach';

const FILTERS: Array<{ label: string; value: OutreachStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'New', value: 'new' },
  { label: 'Drafted', value: 'drafted' },
  { label: 'Approved', value: 'approved' },
  { label: 'Sent', value: 'sent' },
  { label: 'Responded', value: 'responded' },
];

function statusColors(status: OutreachStatus): { bg: string; text: string } {
  if (status === 'drafted') return { bg: '#FACC15', text: '#3F3200' };
  if (status === 'approved') return { bg: '#22C55E', text: '#052E16' };
  if (status === 'sent') return { bg: '#A855F7', text: '#2E1065' };
  if (status === 'responded') return { bg: '#F97316', text: '#431407' };
  return { bg: '#3B82F6', text: '#DBEAFE' };
}

export default function ProspectsListScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<OutreachStatus | 'all'>('all');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const rows = await outreachService.getProspects(filter === 'all' ? undefined : filter);
      setProspects(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prospects.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filterTitle = useMemo(() => {
    if (filter === 'all') return 'All prospects';
    return `${filter.charAt(0).toUpperCase()}${filter.slice(1)} prospects`;
  }, [filter]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Prospects</Text>
          <Text style={styles.subtitle}>{filterTitle}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((item) => (
          <Pressable
            key={item.value}
            style={[styles.filterChip, filter === item.value && styles.filterChipActive]}
            onPress={() => setFilter(item.value)}
          >
            <Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.accent} />}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.loadingText}>Loading prospects...</Text>
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

        {!loading && !error && prospects.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No prospects</Text>
            <Text style={styles.emptyText}>No records match this filter yet.</Text>
          </View>
        ) : null}

        {prospects.map((prospect) => {
          const colors = statusColors(prospect.status);
          return (
            <Pressable
              key={prospect.id}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => router.push(`/(tabs)/outreach/prospect/${prospect.id}`)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.company}>{prospect.companyName}</Text>
                <View style={[styles.badge, { backgroundColor: colors.bg }]}> 
                  <Text style={[styles.badgeText, { color: colors.text }]}>{prospect.status}</Text>
                </View>
              </View>
              <Text style={styles.location}>{prospect.location || 'Location not set'}</Text>
              <Text style={styles.contact}>{prospect.contactName}{prospect.contactTitle ? ` · ${prospect.contactTitle}` : ''}</Text>
            </Pressable>
          );
        })}
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
  filterRow: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  filterText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextActive: {
    color: '#FFFFFF',
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
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 13,
    gap: 6,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  company: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  location: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  contact: {
    color: theme.colors.textPrimary,
    fontSize: 13,
  },
});
