import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { theme } from '../../../../constants/theme';
import { outreachService } from '../../../../services/OutreachService';
import type { EmailDraft } from '../../../../types/outreach';

function showCopiedToast() {
  if (Platform.OS === 'android') {
    ToastAndroid.show('Copied to clipboard — ready to send', ToastAndroid.SHORT);
    return;
  }
  Alert.alert('Copied to clipboard', 'Ready to send');
}

export default function DraftReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const draftId = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id) ?? '', [params.id]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const load = useCallback(async () => {
    if (!draftId) {
      setError('Missing draft ID.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await outreachService.getDraftById(draftId);
      setDraft(data);
      setSubject(data.subject || '');
      setBody(data.body || '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load draft.');
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = useCallback(async () => {
    if (!draftId) return;
    setSubmitting(true);
    try {
      await outreachService.approveDraft(draftId, { subject, body });
      await Clipboard.setStringAsync([`Subject: ${subject}`, '', body].join('\n'));
      showCopiedToast();
      router.replace('/(tabs)/outreach/queue');
    } catch (err) {
      Alert.alert('Approve failed', err instanceof Error ? err.message : 'Unable to approve this draft.');
    } finally {
      setSubmitting(false);
    }
  }, [body, draftId, router, subject]);

  const handlePass = useCallback(async () => {
    if (!draftId) return;
    setSubmitting(true);
    try {
      await outreachService.rejectDraft(draftId, { subject, body });
      router.replace('/(tabs)/outreach/queue');
    } catch (err) {
      Alert.alert('Pass failed', err instanceof Error ? err.message : 'Unable to pass on this draft.');
    } finally {
      setSubmitting(false);
    }
  }, [body, draftId, router, subject]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Draft Review</Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.centerText}>Loading draft...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && draft ? (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <View style={styles.card}>
              <Text style={styles.label}>Prospect</Text>
              <Text style={styles.prospectHeadline}>{draft.companyName}</Text>
              <Text style={styles.prospectInfo}>{draft.contactName}{draft.contactTitle ? ` · ${draft.contactTitle}` : ''}</Text>
              <Text style={styles.prospectInfo}>{draft.contactEmail || 'No email on file'}</Text>
            </View>

            <Text style={styles.label}>Subject</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="Subject"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.subjectInput}
              editable={!submitting}
            />

            <Text style={styles.label}>Email Body</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              multiline
              textAlignVertical="top"
              style={styles.bodyInput}
              placeholder="Draft body"
              placeholderTextColor={theme.colors.textMuted}
              editable={!submitting}
            />
          </ScrollView>

          <View style={styles.actionBar}>
            <Pressable style={[styles.passBtn, submitting && styles.btnDisabled]} onPress={handlePass} disabled={submitting}>
              <Text style={styles.passBtnText}>Pass</Text>
            </Pressable>
            <Pressable style={[styles.approveBtn, submitting && styles.btnDisabled]} onPress={handleApprove} disabled={submitting}>
              <Text style={styles.approveBtnText}>{submitting ? 'Saving...' : 'Approve'}</Text>
            </Pressable>
          </View>
        </>
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
  retryBtn: {
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: '#7F1D1D',
  },
  retryText: {
    color: '#FEE2E2',
    fontSize: 12,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 14,
    gap: 11,
    paddingBottom: 120,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
    gap: 4,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  prospectHeadline: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  prospectInfo: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  subjectInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bodyInput: {
    minHeight: 330,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  passBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    backgroundColor: theme.colors.surfaceElevated,
  },
  passBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  approveBtn: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    backgroundColor: '#16A34A',
  },
  approveBtnText: {
    color: '#ECFDF5',
    fontSize: 15,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.65,
  },
});
