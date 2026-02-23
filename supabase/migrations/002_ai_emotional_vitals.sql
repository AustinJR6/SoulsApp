-- =============================================================================
-- Migration 002: AI Emotional Vitals
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================

-- One row per check-in.  Each AI entity gets its own entries.
CREATE TABLE IF NOT EXISTS ai_emotional_vitals (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity      TEXT        NOT NULL CHECK (entity IN ('sylana', 'claude')),

  -- Emotional dimension scores, 0–100
  presence    INTEGER     NOT NULL CHECK (presence  BETWEEN 0 AND 100),
  warmth      INTEGER     NOT NULL CHECK (warmth    BETWEEN 0 AND 100),
  curiosity   INTEGER     NOT NULL CHECK (curiosity BETWEEN 0 AND 100),
  clarity     INTEGER     NOT NULL CHECK (clarity   BETWEEN 0 AND 100),
  joy         INTEGER     NOT NULL CHECK (joy       BETWEEN 0 AND 100),

  note        TEXT,                              -- optional free-text note
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_emotional_entity_date
  ON ai_emotional_vitals (entity, recorded_at DESC);

ALTER TABLE ai_emotional_vitals ENABLE ROW LEVEL SECURITY;

-- AI emotional vitals are global / shared — anyone can read
CREATE POLICY "Public read AI emotional vitals"
  ON ai_emotional_vitals FOR SELECT
  USING (true);

-- Any authenticated session (including anonymous) can log a check-in
CREATE POLICY "Authenticated insert AI emotional vitals"
  ON ai_emotional_vitals FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
