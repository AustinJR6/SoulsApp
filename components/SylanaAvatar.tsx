import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";
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

function buildHairPath(fringeHeight: number, fringeCurve: number) {
  const topY = 24;
  const fringeY = 34 + fringeHeight / 3;
  return `M 26 54 C 24 ${topY} 42 18 72 16 C 102 18 120 ${topY} 118 54 C 112 42 102 38 94 40 C 86 ${fringeY - fringeCurve} 79 ${fringeY} 72 ${fringeY + 2} C 65 ${fringeY - 2} 58 ${fringeY - fringeCurve} 50 40 C 42 38 32 42 26 54 Z`;
}

function buildHairShadowPath() {
  return "M 33 52 C 38 34 58 26 72 27 C 56 33 48 42 47 56 C 42 56 38 55 33 52 Z";
}

function buildSideLockPath(side: "left" | "right") {
  if (side === "left") {
    return "M 35 53 C 28 64 28 82 36 96 C 40 88 42 74 44 60 Z";
  }
  return "M 109 53 C 116 64 116 82 108 96 C 104 88 102 74 100 60 Z";
}

function buildAccessoryPath(kind: "flower_clip" | "halo_crown" | "comms_band" | "visor") {
  if (kind === "flower_clip") {
    return "M 95 36 C 98 30 104 30 107 36 C 112 33 116 37 114 42 C 118 44 116 50 110 50 C 109 56 102 58 98 53 C 94 56 88 54 89 48 C 84 45 86 38 91 38 C 91 34 94 32 95 36 Z";
  }
  if (kind === "halo_crown") {
    return "M 44 30 Q 72 14 100 30 Q 96 33 92 35 Q 72 23 52 35 Q 48 33 44 30 Z";
  }
  if (kind === "visor") {
    return "M 44 52 Q 72 44 100 52 Q 99 58 96 61 Q 72 53 48 61 Q 45 58 44 52 Z";
  }
  return "M 38 58 C 34 48 38 38 48 34 C 57 31 67 34 72 40 C 78 35 88 32 97 35 C 107 39 110 49 106 58 C 102 58 98 57 94 55 C 87 49 79 48 72 52 C 65 48 57 49 50 55 C 46 57 42 58 38 58 Z";
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

const SYLANA_IMAGE = require("../assets/avatars/sylana.png");

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
  const bobY = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });

  const activeExpression: AvatarExpression = mood === "alert" ? "alert" : expression;
  const eyeHeight =
    activeExpression === "thinking"
      ? Math.max(2.6, profile.eyeRadiusY - 3.5 - blinkValue * 4)
      : Math.max(1.6, profile.eyeRadiusY - blinkValue * (profile.eyeRadiusY - 1.2));
  const eyeWidth = activeExpression === "thinking" ? 7.2 : 8.4;
  const mouthWidth = activeExpression === "thinking" ? profile.mouthWidth - 4 : profile.mouthWidth;
  const shouldUseImageAvatar = personality === "sylana";
  const speakingGlow = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.68],
  });
  const speakingRingScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const speakingRingOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.46],
  });
  const listeningHaloOpacity = activeExpression === "listening" ? 0.65 : activeExpression === "thinking" ? 0.42 : 0.2;
  const accentBadgeColor =
    activeExpression === "alert" ? theme.colors.danger : activeExpression === "thinking" ? "#9dd7ff" : profile.ring;

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
      {shouldUseImageAvatar ? (
        <Animated.View
          style={[
            styles.imageFrame,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: ringColor,
              transform: [{ translateY: bobY }],
            },
          ]}
        >
          <Image source={SYLANA_IMAGE} style={styles.image} resizeMode="cover" />
          <Animated.View
            style={[
              styles.speakingHalo,
              {
                borderColor: profile.ring,
                opacity: speakingGlow,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.speakingRing,
              {
                borderColor: mood === "alert" ? theme.colors.danger : profile.ring,
                transform: [{ scale: speakingRingScale }],
                opacity: talking ? speakingRingOpacity : 0.08,
              },
            ]}
          />
          <View style={[styles.expressionBadge, { backgroundColor: accentBadgeColor }]}>
            <View style={styles.expressionDot} />
          </View>
          <View style={[styles.listeningRing, { borderColor: profile.accent, opacity: listeningHaloOpacity }]} />
        </Animated.View>
      ) : (
        <Svg width={size} height={size} viewBox="0 0 144 144">
          <Circle cx="72" cy="72" r="68" fill={profile.shell} stroke={ringColor} strokeWidth="2.4" />
          <Circle cx="72" cy="72" r="56" fill={profile.face} />
          <Path d={buildHairPath(profile.fringeHeight, profile.fringeCurve)} fill={profile.hair} />
          <Path d={buildHairShadowPath()} fill={profile.hairShadow} opacity={0.78} />
          {profile.sideLocks ? <Path d={buildSideLockPath("left")} fill={profile.hair} /> : null}
          {profile.sideLocks ? <Path d={buildSideLockPath("right")} fill={profile.hair} /> : null}
          <Path
            d={buildAccessoryPath(profile.accessory)}
            fill={profile.accessory === "flower_clip" ? "#ffd6ef" : profile.accessory === "comms_band" ? "#5ec6ff" : profile.accent}
            opacity={0.9}
          />
          <Path d={buildFacePath(profile.jawWidth)} fill={profile.face} stroke={profile.accent} strokeWidth="1.2" />
          <Ellipse cx="54" cy="72" rx="9" ry="6" fill={profile.cheek} />
          <Ellipse cx="90" cy="72" rx="9" ry="6" fill={profile.cheek} />
          <Path d={buildBrowPath("left", profile.browArch, profile.eyeTilt, blinkValue)} stroke={profile.brow} strokeWidth="3.2" fill="none" strokeLinecap="round" />
          <Path d={buildBrowPath("right", profile.browArch, -profile.eyeTilt, blinkValue)} stroke={profile.brow} strokeWidth="3.2" fill="none" strokeLinecap="round" />
          {profile.lashes ? <Path d="M 47 54 L 43 50 M 56 51 L 55 46 M 65 54 L 69 50" stroke={profile.accent} strokeWidth="1.6" strokeLinecap="round" /> : null}
          <Ellipse cx="56" cy="62" rx={eyeWidth} ry={eyeHeight} fill={profile.eye} transform={`rotate(${profile.eyeTilt} 56 62)`} />
          <Ellipse cx="88" cy="62" rx={eyeWidth} ry={eyeHeight} fill={profile.eye} transform={`rotate(${-profile.eyeTilt} 88 62)`} />
          <Ellipse cx="56" cy="63" rx={activeExpression === "thinking" ? 2.6 : 3.8} ry={activeExpression === "thinking" ? 2.2 : 4.8} fill={profile.iris} />
          <Ellipse cx="88" cy="63" rx={activeExpression === "thinking" ? 2.6 : 3.8} ry={activeExpression === "thinking" ? 2.2 : 4.8} fill={profile.iris} />
          <Circle cx="56" cy="63.6" r={activeExpression === "thinking" ? 1.6 : 2.2} fill={profile.pupil} />
          <Circle cx="88" cy="63.6" r={activeExpression === "thinking" ? 1.6 : 2.2} fill={profile.pupil} />
          <Circle cx="58.2" cy="60.8" r="1.5" fill="#ffffff" opacity={0.92} />
          <Circle cx="90.2" cy="60.8" r="1.5" fill="#ffffff" opacity={0.92} />
          <Ellipse cx="55.1" cy="65.6" rx="1.1" ry="0.9" fill="#ffffff" opacity={0.4} />
          <Ellipse cx="87.1" cy="65.6" rx="1.1" ry="0.9" fill="#ffffff" opacity={0.4} />
          <Path d={buildMouthPath(mouthWidth, mouthOpen, activeExpression)} fill={mood === "alert" ? theme.colors.danger : profile.mouth} />
          <Path d="M 42 108 Q 72 120 102 108 L 96 118 Q 72 130 48 118 Z" fill="rgba(126, 205, 255, 0.45)" />
          {activeExpression === "thinking" ? <Path d="M 66 90 Q 72 92 78 90" stroke={profile.accent} strokeWidth="2" fill="none" strokeLinecap="round" /> : null}
          {profile.chinNotch ? <Path d="M 69 108 Q 72 112 75 108" stroke={profile.accent} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity={0.5} /> : null}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    borderWidth: 6,
  },
  imageFrame: {
    overflow: "hidden",
    borderWidth: 2.5,
    backgroundColor: "#0f0818",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  speakingHalo: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 999,
    borderWidth: 2,
  },
  speakingRing: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 9999,
    borderWidth: 2.2,
  },
  expressionBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  expressionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ffffff",
    opacity: 0.92,
  },
  listeningRing: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 999,
    borderWidth: 1.4,
  },
});

export default SylanaAvatar;
