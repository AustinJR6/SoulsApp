/**
 * PhotoPicker
 *
 * Full-screen modal that handles the complete photo-sending flow:
 *   pick (camera / gallery) → compress → auto-tag → tag editor → upload
 *
 * Props:
 *   visible          – controls whether the modal is shown
 *   conversationId   – stored on the photo metadata row (links to chat thread)
 *   aiEntity         – 'sylana' | 'claude' | null
 *   onPhotoUploaded  – called with the final Photo after a successful upload
 *   onCancel         – called when the user dismisses without sending
 */

import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme } from '../constants/theme';
import { autoTagPhoto } from '../services/AutoTagService';
import { uploadPhoto } from '../services/PhotoService';
import type { Photo, PickedPhoto } from '../types/photo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  visible: boolean;
  conversationId: string | null;
  aiEntity: 'sylana' | 'claude' | null;
  onPhotoUploaded: (photo: Photo) => void;
  onCancel: () => void;
}

type Stage = 'source' | 'tagging' | 'editor' | 'uploading';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PhotoPicker({ visible, conversationId, aiEntity, onPhotoUploaded, onCancel }: Props) {
  const [stage, setStage] = useState<Stage>('source');
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [caption, setCaption] = useState('');

  // ── Helpers ──────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStage('source');
    setPicked(null);
    setTags([]);
    setTagInput('');
    setCaption('');
  }, []);

  const handleCancel = useCallback(() => {
    reset();
    onCancel();
  }, [onCancel, reset]);

  // Compress the picked image and auto-tag it
  const processImage = useCallback(async (uri: string, width: number, height: number) => {
    setStage('tagging');

    try {
      // Compress to max 1200 px wide, quality 0.72
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: Math.min(width, 1200) } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      const pickedPhoto: PickedPhoto = {
        localUri: manipResult.uri,
        base64: manipResult.base64 ?? '',
        width: manipResult.width,
        height: manipResult.height,
      };
      setPicked(pickedPhoto);

      // Auto-tag (best-effort)
      const suggestedTags = await autoTagPhoto(pickedPhoto.base64);
      setTags(suggestedTags);
    } catch {
      // Even if tagging fails, proceed to editor with empty tags
      setPicked({ localUri: uri, base64: '', width, height });
      setTags([]);
    }

    setStage('editor');
  }, []);

  // ── Image source pickers ─────────────────────────────────────────────────

  const pickFromGallery = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library in Settings.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await processImage(asset.uri, asset.width, asset.height);
  }, [processImage]);

  const pickFromCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access in Settings.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await processImage(asset.uri, asset.width, asset.height);
  }, [processImage]);

  // ── Tag editing ──────────────────────────────────────────────────────────

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase().replace(/[^a-z0-9_\- ]/g, '');
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  // ── Upload ───────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (!picked) return;
    setStage('uploading');

    try {
      const photo = await uploadPhoto(
        picked.localUri,
        picked.width,
        picked.height,
        tags,
        { conversationId, aiEntity, caption: caption.trim() || null }
      );
      reset();
      onPhotoUploaded(photo);
    } catch (err) {
      setStage('editor');
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Could not upload photo. Please try again.');
    }
  }, [aiEntity, caption, conversationId, onPhotoUploaded, picked, reset, tags]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleCancel}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable onPress={handleCancel} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {stage === 'source' ? 'Share a Photo' :
             stage === 'tagging' ? 'Analyzing…' :
             stage === 'uploading' ? 'Uploading…' :
             'Add Details'}
          </Text>
          <View style={styles.headerBtn} />
        </View>

        {/* ── SOURCE SELECTION ── */}
        {stage === 'source' && (
          <View style={styles.sourceContainer}>
            <Pressable style={styles.sourceBtn} onPress={pickFromCamera}>
              <Ionicons name="camera" size={36} color={theme.colors.accent} />
              <Text style={styles.sourceBtnLabel}>Camera</Text>
            </Pressable>
            <Pressable style={styles.sourceBtn} onPress={pickFromGallery}>
              <Ionicons name="images" size={36} color={theme.colors.accent} />
              <Text style={styles.sourceBtnLabel}>Photo Library</Text>
            </Pressable>
          </View>
        )}

        {/* ── TAGGING / UPLOADING SPINNER ── */}
        {(stage === 'tagging' || stage === 'uploading') && (
          <View style={styles.spinnerContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={styles.spinnerText}>
              {stage === 'tagging' ? 'Reading the photo…' : 'Uploading…'}
            </Text>
          </View>
        )}

        {/* ── TAG EDITOR ── */}
        {stage === 'editor' && picked && (
          <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">

            {/* Image preview */}
            <Image
              source={{ uri: picked.localUri }}
              style={styles.preview}
              resizeMode="cover"
            />

            {/* Tags */}
            <Text style={styles.label}>Tags</Text>
            <View style={styles.tagCloud}>
              {tags.map((tag) => (
                <Pressable key={tag} style={styles.tagChip} onPress={() => removeTag(tag)}>
                  <Text style={styles.tagText}>{tag}</Text>
                  <Ionicons name="close-circle" size={13} color={theme.colors.textMuted} />
                </Pressable>
              ))}
            </View>

            <View style={styles.tagInputRow}>
              <TextInput
                style={styles.tagInput}
                value={tagInput}
                onChangeText={setTagInput}
                placeholder="Add a tag…"
                placeholderTextColor={theme.colors.textMuted}
                onSubmitEditing={addTag}
                returnKeyType="done"
                autoCapitalize="none"
              />
              <Pressable style={styles.addTagBtn} onPress={addTag}>
                <Ionicons name="add" size={20} color={theme.colors.textPrimary} />
              </Pressable>
            </View>

            {/* Caption */}
            <Text style={styles.label}>Caption (optional)</Text>
            <TextInput
              style={styles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="Write a caption…"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              returnKeyType="done"
            />

            {/* Send button */}
            <Pressable style={styles.sendBtn} onPress={handleSend}>
              <Ionicons name="send" size={16} color="#fff" />
              <Text style={styles.sendBtnText}>Send Photo</Text>
            </Pressable>

          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerBtn: {
    minWidth: 60,
  },
  headerBtnText: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },

  // Source selection
  sourceContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 24,
  },
  sourceBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    paddingVertical: 36,
  },
  sourceBtnLabel: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },

  // Spinner
  spinnerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  spinnerText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
  },

  // Editor
  editorContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  preview: {
    width: '100%',
    height: 240,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  tagCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(168,85,247,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.4)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagInput: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
  addTagBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: theme.colors.textPrimary,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
