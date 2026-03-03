/**
 * PhotoService
 *
 * Handles uploading photos to Supabase Storage and saving / fetching metadata
 * in the `photos` table (migration 003_photos.sql).
 */

import { File } from 'expo-file-system';
import { supabase } from './supabase';
import type { Photo } from '../types/photo';

const BUCKET = 'photos';

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user?.id) return data.user.id;

  // If session is missing/expired, try anonymous auth once before failing.
  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) {
    throw new Error(
      'Photo upload requires a Supabase session. Anonymous auth failed; verify Auth > Providers > Anonymous is enabled.'
    );
  }

  const { data: retried, error: retriedError } = await supabase.auth.getUser();
  if (retriedError || !retried.user?.id) {
    throw new Error('Photo upload requires authentication, but no user session is available.');
  }

  return retried.user.id;
}

// ---------------------------------------------------------------------------
// Upload + save
// ---------------------------------------------------------------------------

/**
 * Uploads a compressed local image to the 'photos' Supabase Storage bucket
 * and inserts a metadata row into the `photos` table.
 *
 * @param localUri    file:// URI of the compressed image
 * @param width       image width in px
 * @param height      image height in px
 * @param tags        tag array (from editor / auto-tagger)
 * @param options     optional extra fields
 */
export async function uploadPhoto(
  localUri: string,
  width: number,
  height: number,
  tags: string[],
  options: {
    conversationId?: string | null;
    aiEntity?: 'sylana' | 'claude' | null;
    caption?: string | null;
  } = {}
): Promise<Photo> {
  const uid = await requireUserId();

  const filename = `${uid}/${Date.now()}.jpg`;

  // ── Upload file via fetch → blob (works reliably on both iOS + Android) ──
  const file = new File(localUri);
  const blob = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, blob, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) throw uploadError;

  // ── Derive public URL ──
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  const publicUrl = urlData.publicUrl;

  // ── Insert metadata ──
  const { data, error: insertError } = await supabase
    .from('photos')
    .insert({
      user_id: uid,
      sender: 'elias',
      conversation_id: options.conversationId ?? null,
      ai_entity: options.aiEntity ?? null,
      caption: options.caption ?? null,
      tags,
      storage_path: filename,
      public_url: publicUrl,
      width,
      height,
    })
    .select()
    .single();

  if (insertError) throw insertError;

  return data as Photo;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/** Returns photos sorted newest-first, optionally filtered by a single tag. */
export async function fetchPhotos(tagFilter?: string): Promise<Photo[]> {
  let query = supabase
    .from('photos')
    .select('*')
    .order('created_at', { ascending: false });

  if (tagFilter) {
    query = (query as typeof query).contains('tags', [tagFilter]);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Photo[];
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deletePhoto(photo: Photo): Promise<void> {
  // Remove from storage (best-effort — don't throw if file is already gone)
  await supabase.storage.from(BUCKET).remove([photo.storage_path]).catch(() => {});
  const { error } = await supabase.from('photos').delete().eq('id', photo.id);
  if (error) throw error;
}
