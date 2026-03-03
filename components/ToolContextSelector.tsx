import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Activity,
  Brain,
  FolderOpen,
  GitBranch,
  Github,
  Image,
  Megaphone,
  Search,
  Terminal,
  Wrench,
} from "lucide-react-native";
import { theme } from "../constants/theme";
import type { ToolDescriptor } from "../types";

const ICON_SIZE = 14;

const iconByTool: Record<string, React.ComponentType<{ color?: string; size?: number }>> = {
  web_search: Search,
  code_execution: Terminal,
  files: FolderOpen,
  health_data: Activity,
  work_sessions: GitBranch,
  github: Github,
  photos: Image,
  memories: Brain,
  outreach: Megaphone,
};

function ToolIcon({ id, color }: { id: string; color: string }) {
  const Icon = iconByTool[id] ?? Wrench;
  return <Icon size={ICON_SIZE} color={color} />;
}

interface Preset {
  id: string;
  label: string;
  tools: string[];
}

interface Props {
  expanded: boolean;
  embedded?: boolean;
  availableTools: ToolDescriptor[];
  activeTools: string[];
  presets: Preset[];
  onToggleExpanded: () => void;
  onToggleTool: (toolId: string) => void;
  onPresetSelect: (presetId: string) => void;
}

export function ToolContextSelector({
  expanded,
  embedded = false,
  availableTools,
  activeTools,
  presets,
  onToggleExpanded,
  onToggleTool,
  onPresetSelect,
}: Props) {
  const expandedAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(expandedAnim, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [expanded, expandedAnim]);

  const height = expandedAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [44, 190],
  });

  const activeToolDescriptors = useMemo(
    () => availableTools.filter((tool) => activeTools.includes(tool.id)),
    [activeTools, availableTools]
  );

  const expandedContent = (
    <View style={styles.expandedArea}>
      <View style={styles.presetRow}>
        {presets.map((preset) => (
          <Pressable key={preset.id} style={styles.presetBtn} onPress={() => onPresetSelect(preset.id)}>
            <Text style={styles.presetText}>{preset.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow}>
        {availableTools.map((tool) => {
          const active = activeTools.includes(tool.id);
          return (
            <Pressable
              key={tool.id}
              style={[styles.toolChip, active ? styles.toolChipActive : styles.toolChipInactive]}
              onPress={() => onToggleTool(tool.id)}
            >
              <ToolIcon id={tool.id} color={active ? "#ffffff" : theme.colors.textMuted} />
              <Text style={[styles.toolText, active ? styles.toolTextActive : styles.toolTextInactive]}>{tool.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  if (embedded) {
    return <View style={styles.embeddedWrap}>{expandedContent}</View>;
  }

  return (
    <Animated.View style={[styles.wrap, { height }]}>
      <View style={styles.rowTop}>
        <Pressable style={styles.contextBtn} onPress={onToggleExpanded}>
          <Wrench size={15} color={theme.colors.textSecondary} />
          <Text style={styles.contextBtnText}>Context</Text>
        </Pressable>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeRowContent}>
          {activeToolDescriptors.length === 0 ? (
            <View style={styles.emptyChip}>
              <Text style={styles.emptyChipText}>No tools</Text>
            </View>
          ) : (
            activeToolDescriptors.map((tool) => (
              <View key={tool.id} style={styles.activeChipCompact}>
                <ToolIcon id={tool.id} color={theme.colors.accent} />
                <Text style={styles.activeChipCompactText}>{tool.label}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {expanded ? expandedContent : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: "rgba(12, 8, 23, 0.92)",
    overflow: "hidden",
  },
  embeddedWrap: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    backgroundColor: "rgba(12, 8, 23, 0.92)",
    overflow: "hidden",
  },
  rowTop: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  contextBtn: {
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.surface,
  },
  contextBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  activeRowContent: {
    alignItems: "center",
    gap: 6,
    paddingRight: 8,
  },
  activeChipCompact: {
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.accentMuted,
    backgroundColor: "rgba(168,85,247,0.16)",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  activeChipCompactText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: "600",
  },
  emptyChip: {
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  emptyChipText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  expandedArea: {
    paddingHorizontal: 8,
    paddingBottom: 10,
    gap: 10,
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  presetText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  toolChip: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toolChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  toolChipInactive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  toolText: {
    fontSize: 12,
    fontWeight: "700",
  },
  toolTextActive: {
    color: "#fff",
  },
  toolTextInactive: {
    color: theme.colors.textMuted,
  },
});
