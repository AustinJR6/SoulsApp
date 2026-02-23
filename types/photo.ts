/**
 * Photo types — mirrors the `photos` table in Supabase (migration 003_photos.sql).
 */

export interface Photo {
  id: string;
  user_id: string | null;
  sender: string;               // 'elias' by default
  conversation_id: string | null;
  ai_entity: 'sylana' | 'claude' | null;
  caption: string | null;
  tags: string[];
  storage_path: string;         // path inside the 'photos' bucket
  public_url: string;
  width: number | null;
  height: number | null;
  created_at: string;           // ISO-8601
}

/** Transient shape returned after picking + compressing, before upload. */
export interface PickedPhoto {
  localUri: string;
  base64: string;
  width: number;
  height: number;
}
