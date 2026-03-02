import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { theme } from "../constants/theme";

export interface SylanaAvatarProps {
  talking: boolean;
  size?: number;
  mood?: "neutral" | "warm" | "alert";
  glow?: boolean;
}

function mouthPath(openness: number) {
  const controlY = 78 + openness * 10;
  const bottomY = 82 + openness * 4;
  return `M 58 78 Q 72 ${controlY} 86 78 Q 72 ${bottomY} 58 78 Z`;
}

export function SylanaAvatar({
  talking,
  size = 168,
  mood = "neutral",
  glow = true,
}: SylanaAvatarProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [mouthOpen, setMouthOpen] = useState(0);

  useEffect(() => {
    const id = pulse.addListener(({ value }) => {
      setMouthOpen(value);
    });
    return () => {
      pulse.removeListener(id);
    };
  }, [pulse]);

  useEffect(() => {
    if (!talking) {
      Animated.timing(pulse, {
        toValue: 0,
        duration: 140,
        useNativeDriver: false,
      }).start();
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 220, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0.2, duration: 180, useNativeDriver: false }),
      ])
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [pulse, talking]);

  const ringColor = useMemo(() => {
    if (mood === "alert") return theme.colors.danger;
    if (mood === "warm") return "#ffb347";
    return theme.colors.accent;
  }, [mood]);

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, glow ? 1.07 : 1],
  });

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          styles.glow,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: ringColor,
            opacity: glow ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.72] }) : 0.2,
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      <Svg width={size} height={size} viewBox="0 0 144 144">
        <Circle cx="72" cy="72" r="68" fill="#1b1030" stroke={ringColor} strokeWidth="2" />
        <Circle cx="72" cy="72" r="56" fill="#120a24" />
        <Ellipse cx="56" cy="60" rx="6" ry="8" fill="#f5efff" />
        <Ellipse cx="88" cy="60" rx="6" ry="8" fill="#f5efff" />
        <Circle cx="56" cy="62" r="3" fill="#06030f" />
        <Circle cx="88" cy="62" r="3" fill="#06030f" />
        <Path d="M 46 47 Q 56 39 66 47" stroke={ringColor} strokeWidth="3" fill="none" strokeLinecap="round" />
        <Path d="M 78 47 Q 88 39 98 47" stroke={ringColor} strokeWidth="3" fill="none" strokeLinecap="round" />
        <Path d={mouthPath(mouthOpen)} fill={mood === "alert" ? theme.colors.danger : ringColor} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    borderWidth: 6,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
});

export default SylanaAvatar;
