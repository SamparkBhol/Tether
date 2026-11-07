import { staleVersion } from '../domain/errors';
import type { Commitment, CommitmentState, Terms } from '../domain/types';
import { parseJson } from '../lib/util';
import { exec, lim, one, placeholders, rows } from './db';

interface Row {
  id: string;
  ask_id: string;
  requester_team_id: string;
  owner_team_id: string;
  source_issue_key: string;
  owner_issue_key: string | null;
  title: string;
  state: CommitmentState;
  needed_by: string;
  terms: string;
  pending_terms: string | null;
  goal_weight: number;
  confidence: number | null;
  committed_confidence: number | null;
  delivered_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

const fromRow = (r: Row): Commitment => ({
  id: r.id,
  askId: r.ask_id,
  requesterTeamId: r.requester_team_id,
  ownerTeamId: r.owner_team_id,
  sourceIssueKey: r.source_issue_key,
  ownerIssueKey: r.owner_issue_key ?? undefined,
  title: r.title,
  state: r.state,
  neededBy: r.needed_by,
  terms: parseJson<Terms>(r.terms, { dueDate: r.needed_by, scope: '', size: 1 }),
  pendingTerms: r.pending_terms ? parseJson<Terms | undefined>(r.pending_terms, undefined) : undefined,
  goalWeight: Number(r.goal_weight),
  confidence: r.confidence === null ? undefined : Number(r.confidence),
  committedConfidence: r.committed_confidence === null ? undefined : Number(r.committed_confidence),
  deliveredAt: r.delivered_at ?? undefined,
  version: Number(r.version),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const OPEN = ['proposed', 'countered', 'committed', 'at_risk', 'renegotiating'];

export const getCommitment = async (id: string) => {
  const r = await one<Row>('SELECT * FROM commitments WHERE id = ?', id);
  return r ? fromRow(r) : undefined;
};

export const insertCommitment = (c: Commitment) =>
  exec(
    `INSERT INTO commitments (id, ask_id, requester_team_id, owner_team_id, source_issue_key, owner_issue_key, title, state, needed_by, terms, pending_terms, goal_weight, confidence, committed_confidence, delivered_at, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    c.id,
    c.askId,
    c.requesterTeamId,
    c.ownerTeamId,
    c.sourceIssueKey,
    c.ownerIssueKey ?? null,
    c.title,
    c.state,
    c.neededBy,
    JSON.stringify(c.terms),
    c.pendingTerms ? JSON.stringify(c.pendingTerms) : null,
    c.goalWeight,
    c.confidence ?? null,
    c.committedConfidence ?? null,
    c.deliveredAt ?? null,
    c.version,
    c.createdAt,
    c.updatedAt,
  );

export const saveCommitment = async (c: Commitment, expectedVersion: number) => {
  const n = await exec(
    `UPDATE commitments SET owner_issue_key = ?, state = ?, terms = ?, pending_terms = ?, goal_weight = ?, confidence = ?, committed_confidence = ?, delivered_at = ?, version = ?, updated_at = ?
     WHERE id = ? AND version = ?`,
    c.ownerIssueKey ?? null,
    c.state,
    JSON.stringify(c.terms),
    c.pendingTerms ? JSON.stringify(c.pendingTerms) : null,
    c.goalWeight,
    c.confidence ?? null,
    c.committedConfidence ?? null,
    c.deliveredAt ?? null,
    c.version,
    c.updatedAt,
    c.id,
    expectedVersion,
  );
  if (n === 0) throw staleVersion();
};

export const setOwnerIssue = (id: string, key: string) => exec('UPDATE commitments SET owner_issue_key = ? WHERE id = ?', key, id);

export const setConfidence = (id: string, confidence: number) =>
  exec('UPDATE commitments SET confidence = ? WHERE id = ?', confidence, id);

export const openCommitments = async () =>
  (await rows<Row>(`SELECT * FROM commitments WHERE state IN (${placeholders(OPEN.length)}) LIMIT 2000`, ...OPEN)).map(fromRow);

export const forOwner = async (teamId: string, limit = 200) =>
  (await rows<Row>(`SELECT * FROM commitments WHERE owner_team_id = ? ORDER BY updated_at DESC LIMIT ${lim(limit)}`, teamId)).map(fromRow);

export const forRequester = async (teamId: string, limit = 200) =>
  (await rows<Row>(`SELECT * FROM commitments WHERE requester_team_id = ? ORDER BY updated_at DESC LIMIT ${lim(limit)}`, teamId)).map(fromRow);

export const touchingIssues = async (keys: string[]) => {
  if (!keys.length) return [];
  const p = placeholders(keys.length);
  return (
    await rows<Row>(`SELECT * FROM commitments WHERE source_issue_key IN (${p}) OR owner_issue_key IN (${p})`, ...keys, ...keys)
  ).map(fromRow);
};

export const recent = async (limit = 300) =>
  (await rows<Row>(`SELECT * FROM commitments ORDER BY updated_at DESC LIMIT ${lim(limit)}`)).map(fromRow);
