-- =============================================================================
-- Migration 001: Vitals Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- Or via: npx supabase db push (if you have supabase CLI set up)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- vitals_readings
-- Individual time-stamped sensor readings (HR samples, HRV, resting HR)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vitals_readings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_type  TEXT        NOT NULL,
  value        NUMERIC     NOT NULL,
  unit         TEXT        NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL,
  source       TEXT        NOT NULL DEFAULT 'health_connect',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Efficient range queries: "all HR readings for user X in the last 7 days"
CREATE INDEX IF NOT EXISTS idx_vitals_readings_user_date
  ON vitals_readings (user_id, recorded_at DESC);

-- Efficient per-metric queries used by baseline calculation
CREATE INDEX IF NOT EXISTS idx_vitals_readings_user_metric_date
  ON vitals_readings (user_id, metric_type, recorded_at DESC);

-- Prevent exact duplicate readings from double-syncs
CREATE UNIQUE INDEX IF NOT EXISTS idx_vitals_readings_dedup
  ON vitals_readings (user_id, metric_type, recorded_at, source);

ALTER TABLE vitals_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own readings"
  ON vitals_readings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own readings"
  ON vitals_readings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- vitals_daily_summary
-- One row per user per calendar day — the rolled-up view
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vitals_daily_summary (
  id                     UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                   DATE    NOT NULL,

  -- Cardiovascular
  avg_hr                 INTEGER,                -- bpm
  resting_hr             INTEGER,                -- bpm
  hrv                    NUMERIC,                -- RMSSD ms

  -- Activity
  steps                  INTEGER,
  calories_active        INTEGER,                -- kcal
  calories_total         INTEGER,                -- kcal

  -- Sleep
  sleep_duration_minutes INTEGER,
  sleep_score            INTEGER,                -- 0-100 computed
  sleep_stages           JSONB,                  -- [{stage, startTime, endTime, durationMinutes}]

  -- Stress (Samsung Health doesn't expose this via HC yet — reserved)
  stress_score           INTEGER,

  source                 TEXT    NOT NULL DEFAULT 'health_connect',
  synced_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vitals_daily_summary_user_date_unique UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_vitals_daily_user_date
  ON vitals_daily_summary (user_id, date DESC);

ALTER TABLE vitals_daily_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own summaries"
  ON vitals_daily_summary FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own summaries"
  ON vitals_daily_summary FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own summaries"
  ON vitals_daily_summary FOR UPDATE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- vitals_alerts
-- Fired when a metric deviates from the 14-day rolling baseline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vitals_alerts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type  TEXT        NOT NULL CHECK (alert_type IN ('high', 'low', 'missing')),
  metric      TEXT        NOT NULL,
  value       NUMERIC     NOT NULL,
  baseline    NUMERIC     NOT NULL,
  severity    TEXT        NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Most queries are "active (unresolved) alerts for user"
CREATE INDEX IF NOT EXISTS idx_vitals_alerts_user_active
  ON vitals_alerts (user_id, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vitals_alerts_user_date
  ON vitals_alerts (user_id, created_at DESC);

ALTER TABLE vitals_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own alerts"
  ON vitals_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own alerts"
  ON vitals_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own alerts"
  ON vitals_alerts FOR UPDATE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Helper view: last 14 days of daily summaries (used by baseline logic)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vitals_baseline_window AS
  SELECT *
  FROM vitals_daily_summary
  WHERE date >= CURRENT_DATE - INTERVAL '14 days'
    AND date < CURRENT_DATE;  -- exclude today (incomplete day)
