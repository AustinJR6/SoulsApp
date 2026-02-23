/**
 * PhotoGallery
 *
 * Displays a 3-column grid of photos stored in Supabase.
 * Features:
 *  - Tag-filter pills
 *  - Full-screen viewer modal
 *  - Long-press to delete (with confirmation)
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '../constants/theme';
import { deletePhoto, fetchPhotos } from '../services/PhotoService';
import type { Photo } from '../types/photo';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_GAP = 2;
const CELL_SIZE = (SCREEN_WIDTH - CELL_GAP * 2) / 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTagSet(photos: Photo[]): string[] {
  const set = new Set<string>();
  photos.forEach((p) => p.tags.forEach((t) => set.add(t)));
  return Array.from(set).sort();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Full-screen viewer
// ---------------------------------------------------------------------------

interface ViewerProps {
  photo: Photo | null;
  onClose: () => void;
  onDelete: (photo: Photo) => void;
}

function PhotoViewer({ photo, onClose, onDelete }: ViewerProps) {
  if (!photo) return null;

  const handleDelete = () => {
    Alert.alert('Delete Photo', 'Delete this photo? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(photo) },
    ]);
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={viewerStyles.backdrop}>
        <Pressable style={viewerStyles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        <Image
          source={{ uri: photo.public_url }}
          style={viewerStyles.image}
          resizeMode="contain"
        />

        <View style={viewerStyles.footer}>
          {photo.caption ? (
            <Text style={viewerStyles.caption}>{photo.caption}</Text>
          ) : null}

          {photo.tags.length > 0 && (
            <View style={viewerStyles.tagRow}>
              {photo.tags.map((t) => (
                <View key={t} style={viewerStyles.tagChip}>
                  <Text style={viewerStyles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={viewerStyles.date}>{formatDate(photo.created_at)}</Text>

          <Pressable style={viewerStyles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={16} color="#ff7898" />
            <Text style={viewerStyles.deleteBtnText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 18,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '65%',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 10,
  },
  caption: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    backgroundColor: 'rgba(168,85,247,0.3)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: '#d8b4fe',
    fontSize: 12,
    fontWeight: '600',
  },
  date: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,120,152,0.35)',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,120,152,0.1)',
    marginTop: 4,
  },
  deleteBtnText: {
    color: '#ff7898',
    fontSize: 13,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

interface GalleryProps {
  /** Optional external refresh trigger — bump this value to force a reload. */
  refreshKey?: number;
}

export function PhotoGallery({ refreshKey }: GalleryProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Photo | null>(null);

  const load = useCallback(async (tag?: string | null) => {
    try {
      const data = await fetchPhotos(tag ?? undefined);
      setPhotos(data);
    } catch {
      // silently fail — network or auth issues
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    load(activeTag).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [activeTag, load, refreshKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(activeTag);
    setRefreshing(false);
  }, [activeTag, load]);

  const handleDelete = useCallback(async (photo: Photo) => {
    try {
      await deletePhoto(photo);
      setSelected(null);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch {
      Alert.alert('Delete failed', 'Could not delete this photo right now.');
    }
  }, []);

  const allTags = buildTagSet(photos);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* ── Tag filter row ── */}
      {allTags.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          <Pressable
            style={[styles.filterChip, !activeTag && styles.filterChipActive]}
            onPress={() => setActiveTag(null)}
          >
            <Text style={[styles.filterText, !activeTag && styles.filterTextActive]}>All</Text>
          </Pressable>
          {allTags.map((tag) => (
            <Pressable
              key={tag}
              style={[styles.filterChip, activeTag === tag && styles.filterChipActive]}
              onPress={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              <Text style={[styles.filterText, activeTag === tag && styles.filterTextActive]}>
                {tag}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* ── Photo grid ── */}
      {photos.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>No photos yet</Text>
          <Text style={styles.emptyText}>
            {activeTag
              ? `No photos tagged "${activeTag}"`
              : 'Tap the camera button in chat to share your first photo.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => setSelected(item)} style={styles.cell}>
              <Image source={{ uri: item.public_url }} style={styles.cellImage} resizeMode="cover" />
              {item.tags.length > 0 && (
                <View style={styles.cellTagBadge}>
                  <Text style={styles.cellTagText} numberOfLines={1}>
                    {item.tags[0]}
                  </Text>
                </View>
              )}
            </Pressable>
          )}
        />
      )}

      {/* ── Full-screen viewer ── */}
      <PhotoViewer
        photo={selected}
        onClose={() => setSelected(null)}
        onDelete={handleDelete}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Filters
  filterScroll: {
    maxHeight: 48,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  filterChip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: theme.colors.surface,
  },
  filterChipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: 'rgba(168,85,247,0.2)',
  },
  filterText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: theme.colors.accent,
  },

  // Grid
  grid: {
    gap: CELL_GAP,
  },
  row: {
    gap: CELL_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  cellTagBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    maxWidth: CELL_SIZE - 8,
  },
  cellTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },

  // Empty
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
