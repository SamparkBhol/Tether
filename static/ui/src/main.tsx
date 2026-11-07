import '@atlaskit/css-reset';
import { view } from '@forge/bridge';
import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { call } from './api';
import { Loading, Problem } from './components/bits';
import './styles.css';
import type { Bootstrap } from './types';
import { Ask } from './views/Ask';
import { Desk } from './views/Desk';
import { Home } from './views/Home';
import { Launch, LaunchConfig } from './views/Launch';
import { Panel } from './views/Panel';

interface Ctx {
  moduleKey?: string;
  extension?: {
    issue?: { key?: string };
    project?: { key?: string };
    modal?: { mode?: string; issueKey?: string };
    macro?: { isConfiguring?: boolean };
    config?: { issueKey?: string };
  };
}

const App = () => {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const c = (await view.getContext()) as unknown as Ctx;
      setCtx(c);
      const issueKey = c.extension?.modal?.issueKey ?? c.extension?.issue?.key;
      setBoot(await call<Bootstrap>('bootstrap', { issueKey, projectKey: c.extension?.project?.key }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Problem message={error} onRetry={load} />;
  if (!ctx || !boot) return <Loading />;

  if (ctx.moduleKey === 'tether-launch') {
    const key = ctx.extension?.config?.issueKey ?? '';
    return ctx.extension?.macro?.isConfiguring ? <LaunchConfig initial={key} /> : <Launch boot={boot} issueKey={key} />;
  }
  const modal = ctx.extension?.modal;
  const issueKey = modal?.issueKey ?? ctx.extension?.issue?.key ?? boot.issueKey ?? '';
  if (modal?.mode === 'ask' || ctx.moduleKey === 'tether-ask') return <Ask boot={boot} issueKey={issueKey} inModal />;
  if (ctx.moduleKey === 'tether-panel') return <Panel boot={boot} />;
  if (ctx.moduleKey === 'tether-desk')
    return boot.here ? <Desk boot={boot} teamId={boot.here} onPinned={load} /> : <Problem message="This space isn't linked to a team yet." />;
  return <Home boot={boot} refreshBoot={load} />;
};

view.theme
  .enable()
  .catch(() => undefined)
  .finally(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
