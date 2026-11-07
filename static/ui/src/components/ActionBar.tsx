import Button from '@atlaskit/button/new';
import { showFlag } from '@forge/bridge';
import { useState } from 'react';
import { call } from '../api';
import { addDays, dayLabel, today } from '../format';
import type { Card, Option, Side } from '../types';

interface Props {
  card: Card;
  suggestion?: Option | null;
  onDone: () => void;
}

type Mode = null | 'counter' | 'decline' | 'renegotiate' | 'repropose';

const flag = (title: string, appearance: 'success' | 'error' | 'info' = 'success') =>
  showFlag({ id: `${Date.now()}`, title, type: appearance, isAutoDismiss: true });

export const ActionBar = ({ card, suggestion, onDone }: Props) => {
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(suggestion?.dueDate ?? card.pendingTerms?.dueDate ?? card.terms.dueDate);
  const [items, setItems] = useState(suggestion?.size ?? card.terms.size);
  const [reason, setReason] = useState('');
  const has = (a: string) => card.actions.includes(a);
  const asOwner: Side = 'owner';
  const asRequester: Side = 'requester';

  const run = async (action: Record<string, unknown>, as: Side, done: string) => {
    setBusy(true);
    try {
      await call('act', { id: card.id, action, as });
      flag(done);
      setMode(null);
      onDone();
    } catch (e) {
      flag((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const terms = () => ({ dueDate: date, scope: card.terms.scope, size: items });

  if (mode) {
    const needsTerms = mode !== 'decline';
    const verb = mode === 'counter' ? 'Send counter' : mode === 'decline' ? 'Decline' : mode === 'renegotiate' ? 'Propose new terms' : 'Propose';
    return (
      <form
        className="act-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === 'decline') return void run({ kind: 'decline', reason }, asOwner, 'Declined');
          if (mode === 'counter') return void run({ kind: 'counter', terms: terms(), reason: reason || undefined }, asOwner, 'Counter sent');
          if (mode === 'renegotiate') return void run({ kind: 'renegotiate', terms: terms(), reason: reason || 'New terms proposed' }, asOwner, 'New terms sent');
          return void run({ kind: 'repropose', terms: terms(), reason: reason || undefined }, asRequester, 'Proposed');
        }}
      >
        {needsTerms && (
          <div className="act-row">
            <label>
              <span>Date</span>
              <input type="date" value={date} min={addDays(today(), 1)} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>
              <span>Items</span>
              <input type="number" min={1} max={card.terms.size} value={items} onChange={(e) => setItems(Number(e.target.value))} required />
            </label>
          </div>
        )}
        <label className="act-reason">
          <span>{mode === 'decline' ? 'Why not, and what would help' : 'Note for the other team'}</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required={mode === 'decline'} />
        </label>
        <div className="act-buttons">
          <Button type="submit" appearance={mode === 'decline' ? 'danger' : 'primary'} isDisabled={busy}>
            {verb}
          </Button>
          <Button appearance="subtle" onClick={() => setMode(null)} isDisabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  const offer = suggestion && (suggestion.dueDate !== card.terms.dueDate || suggestion.size !== card.terms.size) ? suggestion : null;
  const ownerCanAccept = card.state === 'proposed' && has('accept');
  const requesterCanAccept = card.state === 'countered' && has('accept');

  return (
    <div className="act-buttons">
      {ownerCanAccept && (
        <Button appearance="primary" isDisabled={busy} onClick={() => run({ kind: 'accept' }, asOwner, `Committed for ${dayLabel(card.terms.dueDate)}`)}>
          Commit to {dayLabel(card.terms.dueDate)}
        </Button>
      )}
      {has('counter') && <Button onClick={() => setMode('counter')}>{offer ? `Offer ${dayLabel(offer.dueDate)}` : 'Counter'}</Button>}
      {has('decline') && (
        <Button appearance="subtle" onClick={() => setMode('decline')}>
          Decline
        </Button>
      )}
      {requesterCanAccept && card.pendingTerms && (
        <Button appearance="primary" isDisabled={busy} onClick={() => run({ kind: 'accept' }, asRequester, 'Accepted')}>
          Accept {dayLabel(card.pendingTerms.dueDate)}
        </Button>
      )}
      {has('repropose') && <Button onClick={() => setMode('repropose')}>Propose another date</Button>}
      {has('acceptRenegotiation') && card.pendingTerms && (
        <Button appearance="primary" isDisabled={busy} onClick={() => run({ kind: 'acceptRenegotiation' }, asRequester, 'New terms accepted')}>
          Accept {dayLabel(card.pendingTerms.dueDate)}
        </Button>
      )}
      {has('rejectRenegotiation') && (
        <Button isDisabled={busy} onClick={() => run({ kind: 'rejectRenegotiation' }, asRequester, 'Kept the original terms')}>
          Keep {dayLabel(card.terms.dueDate)}
        </Button>
      )}
      {has('renegotiate') && <Button onClick={() => setMode('renegotiate')}>Renegotiate</Button>}
      {has('deliver') && card.side === 'owner' && (
        <Button appearance="subtle" isDisabled={busy} onClick={() => run({ kind: 'deliver' }, asOwner, 'Marked delivered')}>
          Mark delivered
        </Button>
      )}
      {has('withdraw') && (
        <Button appearance="subtle" isDisabled={busy} onClick={() => run({ kind: 'withdraw' }, asRequester, 'Withdrawn')}>
          Withdraw
        </Button>
      )}
    </div>
  );
};
