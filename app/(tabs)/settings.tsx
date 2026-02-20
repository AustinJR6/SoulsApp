import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PERSONALITIES } from "../../constants/personalities";
import { theme } from "../../constants/theme";

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>System Settings</Text>
      <Text style={styles.subtitle}>More controls can be added here next.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Personalities</Text>
        {Object.values(PERSONALITIES).map((personality) => (
          <View key={personality.id} style={styles.row}>
            <Text style={[styles.badge, { borderColor: personality.color, color: personality.color }]}>
              {personality.avatar}
            </Text>
            <View style={styles.personalityTextWrap}>
              <Text style={styles.personalityName}>{personality.name}</Text>
              <Text style={styles.personalityDescription}>{personality.description}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    marginTop: 6,
    marginBottom: 14,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: 14,
    gap: 14,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    width: 36,
    height: 36,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    fontSize: 12,
    fontWeight: "700",
  },
  personalityTextWrap: {
    flex: 1,
  },
  personalityName: {
    color: theme.colors.textPrimary,
    fontWeight: "700",
    fontSize: 14,
  },
  personalityDescription: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
});
