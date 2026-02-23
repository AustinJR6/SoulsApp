-- =============================================================================
-- Migration 003: Photo Storage Schema
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Also create the storage bucket (see Step 2 below)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Step 1: Create photos metadata table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS photos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  sender          TEXT        NOT NULL DEFAULT 'elias',
  conversation_id TEXT,                          -- local thread ID from the app
  ai_entity       TEXT        CHECK (ai_entity IN ('sylana', 'claude', null)),
  caption         TEXT,
  tags            TEXT[]      NOT NULL DEFAULT '{}',
  storage_path    TEXT        NOT NULL,           -- path inside the 'photos' bucket
  public_url      TEXT        NOT NULL,
  width           INTEGER,
  height          INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photos_user_date
  ON photos (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_photos_tags
  ON photos USING GIN (tags);

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own photos"
  ON photos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own photos"
  ON photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own photos"
  ON photos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own photos"
  ON photos FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Step 2: Create the storage bucket
-- (Supabase allows this via SQL in the storage schema)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  true,
  5242880,           -- 5 MB max per file
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Public photo access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');

CREATE POLICY "Authenticated photo upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users delete own photos from storage"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'photos' AND auth.uid() IS NOT NULL);
