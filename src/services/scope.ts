import { asAccount, asApp, asUser, type As } from '../jira/client';
import type { GraphScope } from '../graph/context';

export interface Scope {
  accountId?: string;
  cloudId: string;
  installContext?: string;
  as: As;
  system: boolean;
}

interface ForgeContext {
  accountId?: string;
  cloudId?: string;
  installContext?: string;
  principal?: { accountId?: string };
  localId?: string;
}

const cloudFrom = (c: ForgeContext) => c.cloudId ?? c.installContext?.split('/').pop() ?? '';

export const userScope = (context: ForgeContext): Scope => {
  const accountId = context.accountId ?? context.principal?.accountId;
  return { accountId, cloudId: cloudFrom(context), installContext: context.installContext, as: asUser, system: false };
};

export const systemScope = (context: ForgeContext, onBehalfOf?: string): Scope => ({
  accountId: onBehalfOf,
  cloudId: cloudFrom(context),
  installContext: context.installContext,
  as: onBehalfOf ? asAccount(onBehalfOf) : asApp,
  system: true,
});

export const graphScope = (s: Scope): GraphScope => ({ as: s.as, cloudId: s.cloudId, installContext: s.installContext });

export const withAccount = (s: Scope, accountId: string): Scope => ({ ...s, accountId, as: asAccount(accountId) });
