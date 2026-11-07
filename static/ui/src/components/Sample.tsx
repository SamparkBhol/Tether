import Button from '@atlaskit/button/new';
import { showFlag } from '@forge/bridge';
import { useState } from 'react';
import { call, useChanges } from '../api';

export const SampleCard = ({ onDone }: { onDone: () => void }) => {
  const [state, setState] = useState<'idle' | 'building' | 'failed'>('idle');
  useChanges(
    (c) => {
      if (c.state === 'failed') {
        setState('failed');
        showFlag({ id: 'sample-failed', title: (c as unknown as { message?: string }).message ?? 'The sample launch could not be built.', type: 'error', isAutoDismiss: true });
        return;
      }
      setState('idle');
      onDone();
    },
    (c) => c.kind === 'sample',
  );
  return (
    <div className="cta sample">
      <svg className="cta-mark" viewBox="0 0 64 24" aria-hidden="true">
        <path d="M8 12 C 24 2, 40 22, 56 12" />
        <circle cx="8" cy="12" r="6" className="cta-a" />
        <circle cx="56" cy="12" r="6" className="cta-b" />
      </svg>
      <div className="cta-text">
        <p className="cta-title">See it with a real launch</p>
        <p>
          Tether builds a small launch in your own spaces: marketing asks legal, platform, design and security for what it needs, platform asks security in turn,
          and you watch the forecasts and promises play out. Everything is labelled tether-sample and comes out again in one click.
        </p>
      </div>
      <Button
        appearance="primary"
        isDisabled={state === 'building'}
        onClick={async () => {
          setState('building');
          await call('sample', {});
        }}
      >
        {state === 'building' ? 'Building, about a minute' : 'Build a sample launch'}
      </Button>
    </div>
  );
};

const useBuild = (onDone: () => void) => {
  const [state, setState] = useState<'idle' | 'building' | 'failed'>('idle');
  useChanges(
    (c) => {
      if (c.state === 'failed') {
        setState('failed');
        showFlag({ id: 'sample-failed', title: (c as unknown as { message?: string }).message ?? 'The sample launch could not be built.', type: 'error', isAutoDismiss: true });
        return;
      }
      setState('idle');
      showFlag({ id: 'sample-ready', title: 'Sample launch ready', description: 'Open any row to see how each forecast was made.', type: 'success', isAutoDismiss: true });
      onDone();
    },
    (c) => c.kind === 'sample' && c.state !== 'removed',
  );
  const start = async () => {
    setState('building');
    try {
      await call('sample', {});
    } catch (e) {
      setState('failed');
      showFlag({ id: 'sample-err', title: (e as Error).message, type: 'error', isAutoDismiss: true });
    }
  };
  return { state, start };
};

export const SampleButton = ({ onDone }: { onDone: () => void }) => {
  const { state, start } = useBuild(onDone);
  return (
    <Button onClick={start} isDisabled={state === 'building'}>
      {state === 'building' ? 'Building sample launch' : 'Build a sample launch'}
    </Button>
  );
};

export const RemoveSample = ({ onDone }: { onDone: () => void }) => {
  const [busy, setBusy] = useState(false);
  useChanges(
    () => {
      setBusy(false);
      onDone();
    },
    (c) => c.kind === 'sample' && c.state === 'removed',
  );
  return (
    <button
      className="link"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await call('sample', { remove: true });
      }}
    >
      {busy ? 'Removing sample launch' : 'Remove sample launch'}
    </button>
  );
};
