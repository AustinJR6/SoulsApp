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
import type { OutreachStatus, ProspectDetail } from '../../../../types/outreach';

function statusColors(status: OutreachStatus): { bg: string; text: string } {
  if (status === 'drafted') return { bg: '#FACC15', text: '#3F3200' };
  if (status === 'approved') return { bg: '#22C55E', text: '#052E16' };
  if (status === 'sent') return { bg: '#A855F7', text: '#2E1065' };
  if (status === 'responded') return { bg: '#F97316', text: '#431407' };
  return { bg: '#3B82F6', text: '#DBEAFE' };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function ProspectDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const prospectId = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id) ?? '', [params.id]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prospect, setProspect] = useState<ProspectDetail | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const data = await outreachService.getProspectById(prospectId);
        if (mounted) {
          setProspect(data);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load prospect profile.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (!prospectId) {
      setError('Missing prospect ID.');
      setLoading(false);
      return;
    }

    load();

    return () => {
      mounted = false;
    };
  }, [prospectId]);

  const colors = prospect ? statusColors(prospect.status) : null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Prospect Profile</Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.centerText}>Loading profile...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && prospect ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.company}>{prospect.companyName}</Text>
              {colors ? (
                <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                  <Text style={[styles.badgeText, { color: colors.text }]}>{prospect.status}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.fieldValue}>{prospect.location || 'Location not provided'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Contact</Text>
            <Text style={styles.fieldValue}>{prospect.contactName}</Text>
            <Text style={styles.fieldValue}>{prospect.contactTitle || 'Title not provided'}</Text>
            <Text style={styles.fieldValue}>{prospect.contactEmail || 'Email not provided'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Website</Text>
            <Text style={styles.fieldValue}>{prospect.website || 'Not provided'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Notes</Text>
            <Text style={styles.notes}>{prospect.notes || 'No notes yet.'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Timeline</Text>
            <Text style={styles.fieldValue}>Created: {formatDate(prospect.createdAt)}</Text>
            <Text style={styles.fieldValue}>Updated: {formatDate(prospect.updatedAt)}</Text>
          </View>
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
    gap: 6,
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
    fontSize: 17,
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
  fieldLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  fieldValue: {
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
  notes: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
