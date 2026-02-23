-- =============================================================================
-- Migration 004: GitHub Actions Log
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================

-- One row per action performed by an AI entity on a GitHub repo.
CREATE TABLE IF NOT EXISTS github_actions (
  action_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity      TEXT        NOT NULL CHECK (entity IN ('claude', 'sylana')),
  action_type TEXT        NOT NULL CHECK (action_type IN ('commit', 'pr', 'branch', 'issue')),
  repo        TEXT        NOT NULL,          -- owner/repo format
  details     JSONB       NOT NULL DEFAULT '{}',
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id  TEXT                           -- optional link to a work session
);

CREATE INDEX IF NOT EXISTS idx_github_actions_entity
  ON github_actions (entity, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_github_actions_type
  ON github_actions (action_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_github_actions_repo
  ON github_actions (repo, timestamp DESC);

ALTER TABLE github_actions ENABLE ROW LEVEL SECURITY;

-- Anyone can read the activity log (it's a shared feed)
CREATE POLICY "Public read github actions"
  ON github_actions FOR SELECT
  USING (true);

-- Only service-role / authenticated sessions (the backend) can insert
CREATE POLICY "Authenticated insert github actions"
  ON github_actions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
