import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { PERSONALITIES } from "../constants/personalities";
import { theme } from "../constants/theme";
import { usePersonality } from "../contexts/PersonalityContext";

export const PersonalityToggle: React.FC = () => {
  const { currentPersonality, setPersonality } = usePersonality();

  return (
    <View style={styles.container}>
      {Object.values(PERSONALITIES).map((personality) => {
        const active = currentPersonality === personality.id;
        return (
          <TouchableOpacity
            key={personality.id}
            style={[
              styles.button,
              active && { borderColor: personality.color, backgroundColor: "rgba(168,85,247,0.2)" },
            ]}
            onPress={() => setPersonality(personality.id)}
          >
            <Text style={[styles.avatar, active && { color: personality.color }]}>{personality.avatar}</Text>
            <View>
              <Text style={[styles.name, active && styles.nameActive]}>{personality.name}</Text>
              <Text style={styles.description}>{personality.description}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    textAlign: "center",
    textAlignVertical: "center",
    color: theme.colors.textSecondary,
    backgroundColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
    fontWeight: "800",
    fontSize: 12,
    includeFontPadding: false,
  },
  name: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  nameActive: {
    color: theme.colors.textPrimary,
  },
  description: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
});
