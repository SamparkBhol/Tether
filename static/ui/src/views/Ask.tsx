import Button from '@atlaskit/button/new';
import { showFlag, view } from '@forge/bridge';
import { useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../api';
import { Problem, Team } from '../components/bits';
import { Forecast } from '../components/Forecast';
import { Options, verdictLine } from '../components/Options';
import { addDays, dayLabel, today } from '../format';
import type { Bootstrap, Negotiation, Option, TeamLite } from '../types';

interface Draft {
  source: { key: string; summary: string };
  requester: TeamLite;
  owner: TeamLite;
  goals: { id: string; name: string; state?: string; dueDate?: string }[];
  title: string;
  neededBy: string;
  size: number;
  negotiation: Negotiation;
  model: { basis: string; windowEnd?: string; perWeek: number; askShare: number };
  duplicateOf: { id: string; state: string } | null;
  cycle: boolean;
  existingWork: { key: string; summary: string }[];
}

const paceLine = (d: Draft) => {
  const per = Math.round(d.model.perWeek * 10) / 10;
  const share = Math.round(d.model.askShare * 100);
  if (d.model.basis === 'declared') return `${d.owner.name} has no recent history in Jira, so this uses the capacity they set.`;
  const when = d.model.basis === 'past' && d.model.windowEnd ? ` up to ${dayLabel(d.model.windowEnd)}` : '';
  return `${d.owner.name} finished about ${per} items a week${when}, and spends around ${share}% of that on asks from other teams.`;
};

export const Ask = ({ boot, issueKey, inModal }: { boot: Bootstrap; issueKey: string; inModal: boolean }) => {
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState<TeamLite | null>(null);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [neededBy, setNeededBy] = useState(addDays(today(), 14));
  const [size, setSize] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [picked, setPicked] = useState<Option | null>(null);
  const [reuse, setReuse] = useState<string | null>(null);
  const run = useRef(0);

  const names = useMemo(() => new Map(boot.teams.map((t) => [t.id, t.name])), [boot.teams]);
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = boot.teams.filter((t) => !boot.myTeams.includes(t.id) || boot.teams.length < 3);
    const hits = q ? pool.filter((t) => t.name.toLowerCase().includes(q) || t.spaceKeys.some((k) => k.toLowerCase() === q)) : pool;
    return hits.slice(0, 8);
  }, [query, boot]);

  useEffect(() => {
    if (!owner) return;
    const id = ++run.current;
    setDrafting(true);
    const t = setTimeout(async () => {
      try {
        const d = await call<Draft>('draft', { sourceIssueKey: issueKey, ownerTeamId: owner.id, neededBy, size, title: title || undefined, detail });
        if (id !== run.current) return;
        setDraft(d);
        setError(null);
        if (!title) setTitle(d.title);
        setReuse((r) => (r && d.existingWork.some((w) => w.key === r) ? r : (d.existingWork[0]?.key ?? null)));
      } catch (e) {
        if (id === run.current) setError((e as Error).message);
      } finally {
        if (id === run.current) setDrafting(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [owner, neededBy, size]);

  const choose = (o: Option) => {
    setPicked(o);
    if (o.kind === 'later_date') setNeededBy(o.dueDate);
    if (o.kind === 'split_scope') setSize(o.size);
  };

  const send = async () => {
    if (!owner || !draft) return;
    setSending(true);
    try {
      const r = await call<{ id: string; state: string; autoAccepted: boolean; reused: boolean }>('raise', {
        sourceIssueKey: issueKey,
        ownerTeamId: owner.id,
        neededBy,
        size,
        title,
        detail,
        useExisting: reuse,
      });
      showFlag({
        id: r.id,
        title: r.reused ? 'You already asked them for this' : r.autoAccepted ? `${owner.name} committed straight away` : `Sent to ${owner.name}`,
        description: r.autoAccepted ? 'Their team policy accepts small asks like this one automatically.' : 'They see it in their Tether desk with the forecast attached.',
        type: 'success',
        isAutoDismiss: true,
      });
      if (inModal) await view.close();
      else {
        setOwner(null);
        setDraft(null);
        setTitle('');
        setDetail('');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ask">
      <div className="ask-form">
        <h1 className="ask-heading">Ask another team</h1>
        <p className="muted">For {issueKey}. They see your date, your reasons and a forecast of what they can really do.</p>

        {!owner ? (
          <div className="field">
            <label htmlFor="team">Which team?</label>
            <input id="team" autoFocus placeholder="Legal, Platform, Design…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <ul className="team-pick" role="listbox">
              {candidates.map((t) => (
                <li key={t.id}>
                  <button role="option" aria-selected="false" onClick={() => setOwner(t)}>
                    <Team team={t} />
                    <span className="muted small">{t.spaceKeys.join(', ')}</span>
                  </button>
                </li>
              ))}
              {!candidates.length && <li className="muted small">No team matches "{query}".</li>}
            </ul>
          </div>
        ) : (
          <div className="field picked">
            <Team team={owner} size="medium" />
            <button className="link" onClick={() => (setOwner(null), setDraft(null), setPicked(null))}>
              Change
            </button>
          </div>
        )}

        <div className="field">
          <label htmlFor="title">What do you need?</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Review the pricing terms for usage billing" />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="needed">Needed by</label>
            <input id="needed" type="date" min={addDays(today(), 1)} value={neededBy} onChange={(e) => (setNeededBy(e.target.value), setPicked(null))} />
          </div>
          <div className="field">
            <label htmlFor="size">Separate pieces of work</label>
            <input id="size" type="number" min={1} max={20} value={size} onChange={(e) => (setSize(Math.max(1, Number(e.target.value) || 1)), setPicked(null))} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="detail">Why it matters, and what done looks like</label>
          <textarea id="detail" rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </div>
        <div className="act-buttons">
          <Button appearance="primary" onClick={send} isDisabled={!draft || sending || drafting || !!draft?.cycle || !title.trim()}>
            {draft?.duplicateOf ? 'Show existing ask' : `Send to ${owner?.name ?? 'team'}`}
          </Button>
          {inModal && (
            <Button appearance="subtle" onClick={() => view.close()}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <aside className="ask-forecast" aria-live="polite">
        {error && <Problem message={error} />}
        {!owner && <p className="muted">Pick a team to see what they can realistically do.</p>}
        {owner && !draft && !error && <p className="muted">Working out {owner.name}'s odds…</p>}
        {draft && (
          <div className={drafting ? 'stale' : ''}>
            <p className="verdict">{verdictLine(draft.negotiation, draft.owner.name)}</p>
            <Forecast
              curve={draft.negotiation.curve}
              histogram={draft.negotiation.histogram}
              inputs={draft.negotiation.inputs}
              team={draft.owner.name}
              windowEnd={draft.model.windowEnd}
              neededBy={neededBy}
              neededConfidence={draft.negotiation.options[0]?.confidence}
              proposal={draft.negotiation.recommended.kind === 'as_asked' ? undefined : draft.negotiation.recommended.dueDate}
              proposalConfidence={draft.negotiation.recommended.confidence}
              proposalLabel={draft.negotiation.recommended.kind === 'later_date' ? 'Safe date' : undefined}
            />
            {draft.model.basis === 'declared' && <p className="muted small">{paceLine(draft)}</p>}
            {draft.existingWork.length > 0 && (
              <label className="reuse">
                <input type="checkbox" checked={!!reuse} onChange={(e) => setReuse(e.target.checked ? draft.existingWork[0].key : null)} />
                <span>
                  {draft.existingWork[0].key} "{draft.existingWork[0].summary}" already blocks this. Track the ask on it instead of creating a new work item.
                </span>
              </label>
            )}
            {draft.goals.length > 0 && (
              <p className="small">
                Serves {draft.goals.map((g) => g.name.replace(/[.\s]+$/, '')).join(', ')}. Asks tied to company goals go ahead of the rest.
              </p>
            )}
            {draft.cycle && (
              <Problem message={`${draft.owner.name} is already waiting on ${draft.requester.name} for this work. Sort that out before adding another dependency.`} />
            )}
            {draft.duplicateOf && <p className="small">You already have an open ask with them for this work item.</p>}
            {draft.negotiation.options.length > 1 && (
              <>
                <h2 className="sub">Ways to make it work</h2>
                <Options negotiation={draft.negotiation} selected={picked} onSelect={choose} teamName={(id) => names.get(id) ?? 'another team'} />
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
};
