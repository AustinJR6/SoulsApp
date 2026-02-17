import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { PERSONALITIES } from "../constants/personalities";
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
            style={[styles.button, active && { backgroundColor: personality.color }]}
            onPress={() => setPersonality(personality.id)}
          >
            <Text style={styles.avatar}>{personality.avatar}</Text>
            <Text style={[styles.name, active && styles.nameActive]}>{personality.name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
  },
  avatar: {
    fontSize: 20,
    marginRight: 8,
  },
  name: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
  nameActive: {
    color: "#fff",
  },
});
