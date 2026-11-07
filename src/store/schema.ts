import { migrationRunner } from '@forge/sql';

const TEAMS = `CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  source VARCHAR(16) NOT NULL,
  space_keys TEXT NOT NULL,
  avatar_url TEXT,
  profile_url TEXT,
  updated_at VARCHAR(32) NOT NULL
)`;

const POLICIES = `CREATE TABLE IF NOT EXISTS policies (
  team_id VARCHAR(191) PRIMARY KEY,
  body TEXT NOT NULL,
  version INT NOT NULL,
  updated_by VARCHAR(128),
  updated_at VARCHAR(32) NOT NULL
)`;

const ASKS = `CREATE TABLE IF NOT EXISTS asks (
  id VARCHAR(64) PRIMARY KEY,
  requester_team_id VARCHAR(191) NOT NULL,
  owner_team_id VARCHAR(191) NOT NULL,
  source_issue_key VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  detail TEXT,
  needed_by VARCHAR(10) NOT NULL,
  goal_ids TEXT NOT NULL,
  created_by VARCHAR(128) NOT NULL,
  channel VARCHAR(16) NOT NULL,
  agent_client VARCHAR(128),
  created_at VARCHAR(32) NOT NULL
)`;

const COMMITMENTS = `CREATE TABLE IF NOT EXISTS commitments (
  id VARCHAR(64) PRIMARY KEY,
  ask_id VARCHAR(64) NOT NULL,
  requester_team_id VARCHAR(191) NOT NULL,
  owner_team_id VARCHAR(191) NOT NULL,
  source_issue_key VARCHAR(64) NOT NULL,
  owner_issue_key VARCHAR(64),
  title VARCHAR(255) NOT NULL,
  state VARCHAR(16) NOT NULL,
  needed_by VARCHAR(10) NOT NULL,
  terms TEXT NOT NULL,
  pending_terms TEXT,
  goal_weight DOUBLE NOT NULL,
  confidence DOUBLE,
  committed_confidence DOUBLE,
  delivered_at VARCHAR(32),
  version INT NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  updated_at VARCHAR(32) NOT NULL
)`;

const EVENTS = `CREATE TABLE IF NOT EXISTS commitment_events (
  id VARCHAR(64) PRIMARY KEY,
  commitment_id VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL,
  actor TEXT NOT NULL,
  at VARCHAR(32) NOT NULL,
  reason TEXT,
  from_state VARCHAR(16) NOT NULL,
  to_state VARCHAR(16) NOT NULL,
  data TEXT
)`;

const SNAPSHOTS = `CREATE TABLE IF NOT EXISTS forecast_snapshots (
  commitment_id VARCHAR(64) NOT NULL,
  taken_on VARCHAR(10) NOT NULL,
  probability DOUBLE NOT NULL,
  p50 VARCHAR(10) NOT NULL,
  p85 VARCHAR(10) NOT NULL,
  basis VARCHAR(16) NOT NULL,
  PRIMARY KEY (commitment_id, taken_on)
)`;

const OUTCOMES = `CREATE TABLE IF NOT EXISTS outcomes (
  commitment_id VARCHAR(64) PRIMARY KEY,
  owner_team_id VARCHAR(191) NOT NULL,
  predicted DOUBLE NOT NULL,
  hit TINYINT NOT NULL,
  slip_days INT NOT NULL,
  closed_at VARCHAR(32) NOT NULL
)`;

export const migrations = migrationRunner
  .enqueue('v001_teams', TEAMS)
  .enqueue('v002_policies', POLICIES)
  .enqueue('v003_asks', ASKS)
  .enqueue('v004_commitments', COMMITMENTS)
  .enqueue('v005_events', EVENTS)
  .enqueue('v006_snapshots', SNAPSHOTS)
  .enqueue('v007_outcomes', OUTCOMES)
  .enqueue('v008_idx_owner', 'CREATE INDEX idx_commit_owner ON commitments (owner_team_id, state)')
  .enqueue('v009_idx_requester', 'CREATE INDEX idx_commit_requester ON commitments (requester_team_id, state)')
  .enqueue('v010_idx_source', 'CREATE INDEX idx_commit_source ON commitments (source_issue_key)')
  .enqueue('v011_idx_owner_issue', 'CREATE INDEX idx_commit_owner_issue ON commitments (owner_issue_key)')
  .enqueue('v012_idx_events', 'CREATE INDEX idx_events_commitment ON commitment_events (commitment_id, at)')
  .enqueue('v013_snapshot_inputs', 'ALTER TABLE forecast_snapshots ADD COLUMN inputs TEXT')
  .enqueue('v014_commit_p85', 'ALTER TABLE commitments ADD COLUMN forecast_p85 VARCHAR(10)');
