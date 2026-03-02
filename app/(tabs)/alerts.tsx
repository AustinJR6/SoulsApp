import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { theme } from "../../constants/theme";
import { alertService } from "../../services/AlertService";
import { AlertEvent, AlertTopic } from "../../types";

const INTERVAL_OPTIONS = [15, 30, 60, 180, 360];
const FLOOR_OPTIONS: Array<AlertTopic["severity_floor"]> = ["info", "warning", "critical"];

function severityColor(severity: AlertEvent["severity"]) {
  if (severity === "critical") return "#ff5c7a";
  if (severity === "warning") return "#ffb347";
  return "#7dd3fc";
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function AlertsScreen() {
  const [topics, setTopics] = useState<AlertTopic[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [label, setLabel] = useState("");
  const [query, setQuery] = useState("");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [severityFloor, setSeverityFloor] = useState<AlertTopic["severity_floor"]>("warning");

  const load = async () => {
    const [nextTopics, nextEvents] = await Promise.all([
      alertService.listTopics(),
      alertService.listEvents(),
    ]);
    setTopics(nextTopics);
    setEvents(nextEvents);
  };

  useEffect(() => {
    load()
      .catch((error) => {
        Alert.alert("Alerts Unavailable", error instanceof Error ? error.message : "Could not load alerts.");
      })
      .finally(() => setLoading(false));
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const createTopic = async () => {
    if (!label.trim() || !query.trim()) {
      Alert.alert("Missing Fields", "Enter both a label and a search query.");
      return;
    }
    setSubmitting(true);
    try {
      await alertService.createTopic({
        label: label.trim(),
        query: query.trim(),
        interval_minutes: intervalMinutes,
        severity_floor: severityFloor,
      });
      setLabel("");
      setQuery("");
      await load();
    } catch (error) {
      Alert.alert("Create Failed", error instanceof Error ? error.message : "Could not save alert topic.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTopic = async (topic: AlertTopic, enabled: boolean) => {
    try {
      const next = await alertService.updateTopic(topic.topic_id, { enabled });
      setTopics((prev) => prev.map((item) => (item.topic_id === next.topic_id ? next : item)));
    } catch (error) {
      Alert.alert("Update Failed", error instanceof Error ? error.message : "Could not update topic.");
    }
  };

  const runTopicNow = async (topic: AlertTopic) => {
    try {
      const event = await alertService.runTopicNow(topic.topic_id);
      await load();
      if (!event) {
        Alert.alert("No Alert Triggered", "The latest search did not cross the severity threshold.");
      }
    } catch (error) {
      Alert.alert("Run Failed", error instanceof Error ? error.message : "Could not run alert check.");
    }
  };

  const deleteTopic = async (topic: AlertTopic) => {
    try {
      await alertService.deleteTopic(topic.topic_id);
      await load();
    } catch (error) {
      Alert.alert("Delete Failed", error instanceof Error ? error.message : "Could not delete topic.");
    }
  };

  const acknowledgeEvent = async (event: AlertEvent) => {
    try {
      await alertService.acknowledgeEvent(event.event_id);
      setEvents((prev) =>
        prev.map((item) =>
          item.event_id === event.event_id ? { ...item, acknowledged_at: new Date().toISOString() } : item
        )
      );
    } catch (error) {
      Alert.alert("Acknowledge Failed", error instanceof Error ? error.message : "Could not acknowledge alert.");
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.loadingText}>Loading alert system...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.accent} />}
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Alert System</Text>
        <Text style={styles.title}>Scheduled web checks for high-signal events.</Text>
        <Text style={styles.subtitle}>
          Add any topic, set how often Vessel checks it, and let the backend escalate to info, warning, or critical.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Create Topic</Text>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Label this alert stream"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
        />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder='Examples: "developments on united states war"'
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, styles.queryInput]}
          multiline
        />
        <Text style={styles.sectionHint}>How often should this run?</Text>
        <View style={styles.optionRow}>
          {INTERVAL_OPTIONS.map((value) => (
            <Pressable
              key={value}
              style={[styles.optionChip, intervalMinutes === value && styles.optionChipActive]}
              onPress={() => setIntervalMinutes(value)}
            >
              <Text style={styles.optionChipText}>{value}m</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.sectionHint}>Minimum severity to notify</Text>
        <View style={styles.optionRow}>
          {FLOOR_OPTIONS.map((value) => (
            <Pressable
              key={value}
              style={[styles.optionChip, severityFloor === value && styles.optionChipActive]}
              onPress={() => setSeverityFloor(value)}
            >
              <Text style={styles.optionChipText}>{value}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={[styles.primaryButton, submitting && styles.buttonDisabled]} disabled={submitting} onPress={createTopic}>
          <Ionicons name="add-circle-outline" size={18} color={theme.colors.textPrimary} />
          <Text style={styles.primaryButtonText}>Create Alert Topic</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Tracked Topics</Text>
        {topics.length === 0 ? <Text style={styles.emptyText}>No alert topics yet.</Text> : null}
        {topics.map((topic) => (
          <View key={topic.topic_id} style={styles.topicCard}>
            <View style={styles.topicHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.topicLabel}>{topic.label}</Text>
                <Text style={styles.topicQuery}>{topic.query}</Text>
              </View>
              <Switch value={topic.enabled} onValueChange={(value) => void toggleTopic(topic, value)} />
            </View>
            <View style={styles.topicMetaRow}>
              <Text style={styles.topicMeta}>Every {topic.interval_minutes} min</Text>
              <Text style={styles.topicMeta}>Notify at {topic.severity_floor}+</Text>
              <Text style={styles.topicMeta}>Checked {formatTimestamp(topic.last_checked_at)}</Text>
            </View>
            <View style={styles.topicActionRow}>
              <Pressable style={styles.secondaryButton} onPress={() => void runTopicNow(topic)}>
                <Text style={styles.secondaryButtonText}>Run now</Text>
              </Pressable>
              <Pressable style={styles.ghostButton} onPress={() => void deleteTopic(topic)}>
                <Text style={styles.ghostButtonText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Recent Alerts</Text>
        {events.length === 0 ? <Text style={styles.emptyText}>No alert events yet.</Text> : null}
        {events.map((event) => (
          <View key={event.event_id} style={[styles.eventCard, { borderColor: severityColor(event.severity) }]}>
            <View style={styles.eventHeader}>
              <Text style={[styles.severityBadge, { backgroundColor: severityColor(event.severity) }]}>
                {event.severity.toUpperCase()}
              </Text>
              <Text style={styles.eventTopic}>{event.topic_label}</Text>
            </View>
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.eventSummary}>{event.summary}</Text>
            <Text style={styles.eventMeta}>
              Score {event.score} • {event.result_count} results • {formatTimestamp(event.created_at)}
            </Text>
            {!event.acknowledged_at ? (
              <Pressable style={styles.secondaryButton} onPress={() => void acknowledgeEvent(event)}>
                <Text style={styles.secondaryButtonText}>Acknowledge</Text>
              </Pressable>
            ) : (
              <Text style={styles.acknowledgedText}>Acknowledged</Text>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 36,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    color: theme.colors.textSecondary,
  },
  hero: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  eyebrow: {
    color: "#ffb347",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  panel: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  panelTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  input: {
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  queryInput: {
    minHeight: 86,
    textAlignVertical: "top",
  },
  sectionHint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.surfaceElevated,
  },
  optionChipActive: {
    backgroundColor: "rgba(255,92,122,0.18)",
    borderColor: "#ff5c7a",
  },
  optionChipText: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  primaryButton: {
    backgroundColor: "#ff5c7a",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: {
    color: theme.colors.textPrimary,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyText: {
    color: theme.colors.textMuted,
  },
  topicCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  topicHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  topicLabel: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  topicQuery: {
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  topicMetaRow: {
    gap: 4,
  },
  topicMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  topicActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(168,85,247,0.15)",
  },
  secondaryButtonText: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
  },
  ghostButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ghostButtonText: {
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  eventCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 18,
    padding: 14,
    gap: 8,
    borderWidth: 1,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  severityBadge: {
    color: "#120a24",
    fontWeight: "900",
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  eventTopic: {
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  eventTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  eventSummary: {
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  eventMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  acknowledgedText: {
    color: "#7dd3fc",
    fontWeight: "700",
  },
});
