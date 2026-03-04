import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { AVATAR_PROFILES } from "../constants/avatarProfiles";
import { theme } from "../constants/theme";
import { AvatarExpression, AvatarMood, AvatarPersonalityId } from "../types/avatar";

export interface SylanaAvatarProps {
  talking: boolean;
  size?: number;
  mood?: AvatarMood;
  glow?: boolean;
  personality?: AvatarPersonalityId;
  expression?: AvatarExpression;
}

function buildFacePath(jawWidth: number) {
  const left = 72 - jawWidth / 2;
  const right = 72 + jawWidth / 2;
  return `M ${left} 40 C 36 48 34 104 72 114 C 110 104 108 48 ${right} 40 C 100 28 44 28 ${left} 40 Z`;
}

function buildMouthPath(width: number, openness: number, expression: AvatarExpression) {
  const left = 72 - width;
  const right = 72 + width;
  const topY = expression === "alert" ? 80 : expression === "thinking" ? 83 : 82;
  const controlY = topY + openness * (expression === "speaking" ? 13 : 8);
  const bottomY = topY + 4 + openness * 8;
  return `M ${left} ${topY} Q 72 ${controlY} ${right} ${topY} Q 72 ${bottomY} ${left} ${topY} Z`;
}

function buildBrowPath(side: "left" | "right", arch: number, eyeTilt: number, blink: number) {
  const direction = side === "left" ? -1 : 1;
  const startX = side === "left" ? 45 : 79;
  const endX = side === "left" ? 65 : 99;
  const baseY = 48 + blink * 1.5;
  const controlX = 72 + direction * 14;
  const controlY = baseY - arch + eyeTilt;
  return `M ${startX} ${baseY} Q ${controlX} ${controlY} ${endX} ${baseY + direction * 1.2}`;
}

export function SylanaAvatar({
  talking,
  size = 168,
  mood = "neutral",
  glow = true,
  personality = "sylana",
  expression = talking ? "speaking" : "idle",
}: SylanaAvatarProps) {
  const profile = AVATAR_PROFILES[personality];
  const pulse = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(0)).current;
  const [mouthOpen, setMouthOpen] = useState(0);
  const [blinkValue, setBlinkValue] = useState(0);

  useEffect(() => {
    const mouthListener = pulse.addListener(({ value }) => setMouthOpen(value));
    const blinkListener = blink.addListener(({ value }) => setBlinkValue(value));
    return () => {
      pulse.removeListener(mouthListener);
      blink.removeListener(blinkListener);
    };
  }, [blink, pulse]);

  useEffect(() => {
    if (!talking) {
      Animated.timing(pulse, {
        toValue: expression === "thinking" ? 0.12 : 0,
        duration: 160,
        useNativeDriver: false,
      }).start();
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 210, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0.18, duration: 170, useNativeDriver: false }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [expression, pulse, talking]);

  useEffect(() => {
    const cycle = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(blink, { toValue: 1, duration: 90, useNativeDriver: false }),
        Animated.timing(blink, { toValue: 0, duration: 120, useNativeDriver: false }),
      ])
    );
    cycle.start();
    return () => cycle.stop();
  }, [blink]);

  const ringColor = useMemo(() => {
    if (mood === "alert") return theme.colors.danger;
    if (mood === "warm") return profile.ring;
    return profile.accent;
  }, [mood, profile.accent, profile.ring]);

  const glowColor = mood === "alert" ? "rgba(239,68,68,0.32)" : profile.glow;
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, glow ? 1.08 : 1],
  });

  const activeExpression: AvatarExpression = mood === "alert" ? "alert" : expression;
  const eyeHeight =
    activeExpression === "thinking"
      ? Math.max(2.6, profile.eyeRadiusY - 3.5 - blinkValue * 4)
      : Math.max(1.6, profile.eyeRadiusY - blinkValue * (profile.eyeRadiusY - 1.2));
  const mouthWidth = activeExpression === "thinking" ? profile.mouthWidth - 4 : profile.mouthWidth;

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
            backgroundColor: glowColor,
            opacity: glow ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.38] }) : 0.14,
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      <Svg width={size} height={size} viewBox="0 0 144 144">
        <Circle cx="72" cy="72" r="68" fill={profile.shell} stroke={ringColor} strokeWidth="2.4" />
        <Circle cx="72" cy="72" r="56" fill={profile.face} />
        <Path d={buildFacePath(profile.jawWidth)} fill={profile.face} stroke={profile.accent} strokeWidth="1.2" />
        <Ellipse cx="54" cy="72" rx="9" ry="6" fill={profile.cheek} />
        <Ellipse cx="90" cy="72" rx="9" ry="6" fill={profile.cheek} />
        <Path d={buildBrowPath("left", profile.browArch, profile.eyeTilt, blinkValue)} stroke={profile.brow} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <Path d={buildBrowPath("right", profile.browArch, -profile.eyeTilt, blinkValue)} stroke={profile.brow} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        {profile.lashes ? <Path d="M 47 54 L 43 50 M 56 51 L 55 46 M 65 54 L 69 50" stroke={profile.accent} strokeWidth="1.6" strokeLinecap="round" /> : null}
        <Ellipse cx="56" cy="62" rx="6.4" ry={eyeHeight} fill={profile.eye} transform={`rotate(${profile.eyeTilt} 56 62)`} />
        <Ellipse cx="88" cy="62" rx="6.4" ry={eyeHeight} fill={profile.eye} transform={`rotate(${-profile.eyeTilt} 88 62)`} />
        <Circle cx="56" cy="63" r={activeExpression === "thinking" ? 2.1 : 3} fill={profile.pupil} />
        <Circle cx="88" cy="63" r={activeExpression === "thinking" ? 2.1 : 3} fill={profile.pupil} />
        <Circle cx="58" cy="61" r="1.1" fill="#ffffff" opacity={0.8} />
        <Circle cx="90" cy="61" r="1.1" fill="#ffffff" opacity={0.8} />
        <Path d={buildMouthPath(mouthWidth, mouthOpen, activeExpression)} fill={mood === "alert" ? theme.colors.danger : profile.mouth} />
        {activeExpression === "thinking" ? <Path d="M 66 90 Q 72 92 78 90" stroke={profile.accent} strokeWidth="2" fill="none" strokeLinecap="round" /> : null}
        {profile.chinNotch ? <Path d="M 69 108 Q 72 112 75 108" stroke={profile.accent} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity={0.5} /> : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    borderWidth: 6,
  },
});

export default SylanaAvatar;
